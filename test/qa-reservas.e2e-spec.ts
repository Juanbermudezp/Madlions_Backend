/**
 * QA-5.1 · Verificación de los 9 criterios de aceptación de H5 (reserva de un cupo).
 *
 * Contra la base real del docker-compose. Crea sus propios datos con el
 * prefijo QA-5.1 (tipos de clase, planes, miembros, membresías y clases) y
 * los borra al terminar. Cada bloque `describe` es un criterio de aceptación
 * y cada `it` lleva el ID del caso del documento docs/qa/H5-pruebas-reservas.md.
 *
 * Requisitos: migraciones aplicadas y `npm run db:seed` (usa al entrenador,
 * a recepción y al admin del seed).
 * Ejecutar: npm run test:e2e -- test/qa-reservas.e2e-spec.ts
 */
import { randomInt, randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { hoyLocal, sumarDias } from '@Common/fechas';
import { PrismaService } from '@Prisma/services';
import { EstadoClase, TipoPlan } from '@PrismaClient';
import { auditoriaClaseFixture } from './qa/auditoria-clase-fixture.js';

const HORA = 60 * 60 * 1000;
const CONCURRENTES = 10;

type Miembro = { id: string; usuarioId: string; email: string; token: string; membresiaId: string };

describe('QA-5.1 · Reserva de un cupo (H5)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    const corrida = randomUUID().slice(0, 6);
    const base = randomInt(100_000, 899_000);
    const hoy = hoyLocal();
    const dia = (d: string) => new Date(`${d}T00:00:00Z`);

    let entrenadorId: string;
    let recepcionId: string;
    let passwordHash: string;
    let tokenAdmin: string;
    const tipo = {} as Record<'yoga' | 'box', { id: string; nombre: string }>;
    const plan = {} as Record<'mensual' | 'set', string>;
    const clases: string[] = [];
    const usuarios: string[] = [];
    // Miembros por escenario.
    let mensual: Miembro; // Mensual vigente (vence en 20 días), incluye Yoga
    let proxima: Miembro; // Mensual que vence en 2 días: "Próxima a vencer"
    let set: Miembro; // Set de 2 clases vigente
    let vencida: Miembro; // Mensual que venció ayer
    const fila: Miembro[] = []; // miembros vigentes para la prueba de concurrencia

    const http = () => request(app.getHttpServer());
    const como = (m: Miembro) => ({ Authorization: `Bearer ${m.token}` });
    const reservar = (m: Miembro, claseId: string) => http().post('/api/v1/reservas').set(como(m)).send({ claseId });
    const reservables = (m: Miembro, semana: string) =>
        http().get('/api/v1/clases/reservables').query({ semana }).set(como(m));
    const confirmadas = (claseId: string) => prisma.reserva.count({ where: { claseId, estado: 'CONFIRMADA' } });
    const creditos = async (m: Miembro) =>
        (await http().get('/api/v1/membresias/mia').set(como(m))).body.creditosDisponibles as number;

    async function login(email: string) {
        const res = await http().post('/api/v1/auth/login').send({ email, password: 'Demo1234!' });
        if (res.status !== 200) throw new Error(`No se pudo iniciar sesión con ${email}: corre npm run db:seed`);
        return (res.body as { accessToken: string }).accessToken;
    }

    /** Miembro de prueba con una membresía PAGADA del plan dado, que incluye Yoga. */
    async function crearMiembro(i: number, datos: { plan: 'mensual' | 'set'; desde: number; hasta: number }) {
        const n = base + i;
        const email = `qa51-${corrida}-${i}@test.com`;
        const usuario = await prisma.user.create({
            data: { email, passwordHash, nombre: 'Prueba', apellido: `QA51 ${i}`, telefono: String(75_000_000 + n).slice(0, 8) },
        });
        usuarios.push(usuario.id);
        const miembro = await prisma.miembro.create({
            data: {
                usuarioId: usuario.id,
                documento: `${String(n).padStart(8, '0')}-${i % 10}`,
                codigoMiembro: `MBR-${String(n).padStart(6, '0')}`,
            },
        });
        const esSet = datos.plan === 'set';
        const membresia = await prisma.membresia.create({
            data: {
                miembroId: miembro.id, planId: plan[datos.plan], nombrePlan: esSet ? 'Set 2 clases' : 'Mensual',
                tipoPlan: esSet ? TipoPlan.SET_CLASES : TipoPlan.MENSUAL, precio: esSet ? 20 : 35,
                cantidadClases: esSet ? 2 : null, tipoOperacion: 'COMPRA', estado: 'PAGADA',
                fechaInicioSolicitada: dia(sumarDias(hoy, datos.desde)), fechaInicio: dia(sumarDias(hoy, datos.desde)),
                fechaVencimiento: dia(sumarDias(hoy, datos.hasta)), registradaPorId: recepcionId,
                tiposClase: { create: [{ tipoClaseId: tipo.yoga.id }] },
            },
        });
        return { id: miembro.id, usuarioId: usuario.id, email, token: await login(email), membresiaId: membresia.id };
    }

    /** Clase que empieza dentro de `horas` horas (puede ser negativo) y dura una hora. */
    async function crearClase(horas: number, datos: { cupo?: number; tipo?: 'yoga' | 'box'; estado?: EstadoClase } = {}) {
        const inicio = new Date(Date.now() + horas * HORA);
        inicio.setUTCSeconds(0, 0);
        const clase = await prisma.clase.create({
            data: {
                tipoClaseId: tipo[datos.tipo ?? 'yoga'].id, entrenadorId, inicio, fin: new Date(inicio.getTime() + HORA),
                cupoMaximo: datos.cupo ?? 10, estado: datos.estado ?? EstadoClase.PROGRAMADA,
                ...await auditoriaClaseFixture(prisma, datos.estado ?? EstadoClase.PROGRAMADA),
            },
        });
        clases.push(clase.id);
        return clase;
    }

    beforeAll(async () => {
        const ref = await Test.createTestingModule({ imports: [AppModule] }).compile();
        app = ref.createNestApplication();
        app.setGlobalPrefix('api/v1');
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
        await app.init();
        prisma = app.get(PrismaService);

        entrenadorId = (await prisma.user.findUniqueOrThrow({ where: { email: 'entrenador@madlions.com' } })).id;
        recepcionId = (await prisma.user.findUniqueOrThrow({ where: { email: 'recepcion@madlions.com' } })).id;
        passwordHash = (await prisma.user.findUniqueOrThrow({ where: { email: 'miembro@madlions.com' } })).passwordHash;
        tokenAdmin = await login('admin@madlions.com');

        for (const [clave, nombre] of [['yoga', 'Yoga'], ['box', 'Box']] as const) {
            const t = await prisma.tipoClase.create({ data: { nombre: `QA51 ${nombre} ${corrida}`, descripcion: 'QA-5.1' } });
            tipo[clave] = { id: t.id, nombre: t.nombre };
        }
        plan.mensual = (await prisma.plan.create({
            data: { nombre: `[QA-5.1] Mensual ${corrida}`, tipo: TipoPlan.MENSUAL, precio: 35, duracionDias: 30, beneficios: 'QA H5' },
        })).id;
        plan.set = (await prisma.plan.create({
            data: { nombre: `[QA-5.1] Set ${corrida}`, tipo: TipoPlan.SET_CLASES, precio: 20, cantidadClases: 2, duracionDias: 30, beneficios: 'QA H5' },
        })).id;

        mensual = await crearMiembro(0, { plan: 'mensual', desde: -5, hasta: 20 });
        proxima = await crearMiembro(1, { plan: 'mensual', desde: -27, hasta: 2 });
        set = await crearMiembro(2, { plan: 'set', desde: -3, hasta: 26 });
        vencida = await crearMiembro(3, { plan: 'mensual', desde: -31, hasta: -1 });
        for (let i = 0; i < CONCURRENTES; i++) fila.push(await crearMiembro(10 + i, { plan: 'mensual', desde: -5, hasta: 20 }));
    });

    afterAll(async () => {
        const miembros = [mensual, proxima, set, vencida, ...fila].filter(Boolean).map((m) => m.id);
        await prisma.aviso.deleteMany({ where: { miembroId: { in: miembros } } });
        await prisma.reserva.deleteMany({ where: { claseId: { in: clases } } });
        await prisma.clase.deleteMany({ where: { id: { in: clases } } });
        await prisma.membresia.deleteMany({ where: { miembroId: { in: miembros } } });
        await prisma.user.deleteMany({ where: { id: { in: usuarios } } });
        await prisma.plan.deleteMany({ where: { id: { in: Object.values(plan) } } });
        await prisma.tipoClase.deleteMany({ where: { id: { in: Object.values(tipo).map((t) => t.id) } } });
        await app.close();
    });

    describe('Criterio 1 · Clases de la semana: programadas, futuras, ordenadas y con la semana siguiente', () => {
        it('QA-01 · lista solo clases programadas que no empiezan, con tipo, entrenador, horario y lugares, por hora', async () => {
            const tarde = await crearClase(30);
            const temprano = await crearClase(28);
            const cancelada = await crearClase(29, { estado: EstadoClase.CANCELADA_GIMNASIO });
            const iniciada = await crearClase(-0.5);
            const semana = hoyLocal(temprano.inicio);

            const res = await reservables(mensual, semana);

            expect(res.status).toBe(200);
            const ids = (res.body as { id: string }[]).map((c) => c.id);
            expect(ids).not.toContain(cancelada.id);
            expect(ids).not.toContain(iniciada.id);
            expect(ids.indexOf(temprano.id)).toBeLessThan(ids.indexOf(tarde.id));
            expect(res.body.find((c: { id: string }) => c.id === temprano.id)).toEqual({
                id: temprano.id,
                tipo: { id: tipo.yoga.id, nombre: tipo.yoga.nombre },
                entrenador: { id: entrenadorId, nombre: expect.any(String) },
                inicio: temprano.inicio.toISOString(),
                fin: temprano.fin.toISOString(),
                cupoMaximo: 10,
                lugaresDisponibles: 10,
                yaReservada: false,
            });
        });

        it('QA-02 · se puede pasar a la semana siguiente; más allá responde 400', async () => {
            expect((await reservables(mensual, sumarDias(hoy, 7))).status).toBe(200);
            const lejos = await reservables(mensual, sumarDias(hoy, 21));
            expect([lejos.status, lejos.body.message]).toEqual([400, 'Solo puedes consultar las clases de esta semana o de la siguiente.']);
        });
    });

    describe('Criterio 2 · Semana sin clases', () => {
        it('QA-03 · una semana sin clases programadas devuelve una lista vacía (la pantalla muestra el mensaje)', async () => {
            // Se apartan temporalmente las clases futuras de la semana siguiente para que quede vacía.
            const semana = sumarDias(hoy, 7);
            const delaSemana = (await reservables(mensual, semana)).body as { id: string }[];
            const ids = delaSemana.map((c) => c.id);
            const respaldo = await prisma.clase.findMany({ where: { id: { in: ids } }, select: { id: true, inicio: true, fin: true } });
            try {
                for (const c of respaldo) {
                    await prisma.clase.update({
                        where: { id: c.id },
                        data: { inicio: new Date(c.inicio.getTime() + 60 * 24 * HORA), fin: new Date(c.fin.getTime() + 60 * 24 * HORA) },
                    });
                }
                const res = await reservables(mensual, semana);
                expect([res.status, res.body]).toEqual([200, []]);
            } finally {
                for (const c of respaldo) await prisma.clase.update({ where: { id: c.id }, data: { inicio: c.inicio, fin: c.fin } });
            }
        });
    });

    describe('Criterio 3 · Detalle antes de confirmar', () => {
        it('QA-04 · cada clase trae los datos del detalle: tipo, entrenador, fecha y horario, y lugares', async () => {
            const clase = await crearClase(32, { cupo: 7 });
            const res = await reservables(mensual, hoyLocal(clase.inicio));
            const detalle = res.body.find((c: { id: string }) => c.id === clase.id);
            expect(detalle).toMatchObject({ tipo: { nombre: tipo.yoga.nombre }, lugaresDisponibles: 7 });
            expect(detalle.entrenador.nombre).toMatch(/\S+ \S+/);
            expect(new Date(detalle.inicio).getTime()).toBe(clase.inicio.getTime());
        });
    });

    describe('Criterio 4 · Reserva confirmada con membresía Vigente o Próxima a vencer', () => {
        it('QA-05 · Mensual vigente: 201 Confirmada, aparece en Mis reservas y los lugares bajan en uno', async () => {
            const clase = await crearClase(34, { cupo: 5 });
            const res = await reservar(mensual, clase.id);

            expect(res.status).toBe(201);
            expect(res.body).toEqual({ id: expect.any(String), estado: 'CONFIRMADA', lugaresDisponibles: 4 });
            const guardada = await prisma.reserva.findUniqueOrThrow({ where: { id: res.body.id } });
            expect(guardada).toMatchObject({ estado: 'CONFIRMADA', membresiaId: mensual.membresiaId });
            expect(Math.abs(guardada.creadaEn.getTime() - Date.now())).toBeLessThan(60_000);

            const mias = await http().get('/api/v1/reservas/mias').set(como(mensual));
            expect(mias.body.map((r: { id: string }) => r.id)).toContain(res.body.id);
            const lista = await reservables(mensual, hoyLocal(clase.inicio));
            expect(lista.body.find((c: { id: string }) => c.id === clase.id)).toMatchObject({ lugaresDisponibles: 4, yaReservada: true });
        });

        it('QA-06 · Próxima a vencer: también puede reservar una clase que su membresía cubre', async () => {
            expect((await http().get('/api/v1/membresias/mia').set(como(proxima))).body.estado).toBe('PROXIMA_A_VENCER');
            const clase = await crearClase(20);
            expect((await reservar(proxima, clase.id)).status).toBe(201);
        });
    });

    describe('Criterio 5 · Set de clases: cada reserva compromete un crédito', () => {
        it('QA-07 · las reservas bajan los créditos y sin créditos se rechaza con el mensaje', async () => {
            const [a, b, c] = [await crearClase(40), await crearClase(42), await crearClase(44)];
            expect(await creditos(set)).toBe(2);

            expect((await reservar(set, a.id)).status).toBe(201);
            expect(await creditos(set)).toBe(1);
            expect((await reservar(set, b.id)).status).toBe(201);
            expect(await creditos(set)).toBe(0);

            const sinCreditos = await reservar(set, c.id);
            expect([sinCreditos.status, sinCreditos.body.message]).toEqual([409, 'No te quedan clases disponibles en tu plan']);
            expect(await confirmadas(c.id)).toBe(0);
        });
    });

    describe('Criterio 6 · Reserva duplicada o con traslape', () => {
        it('QA-08 · reservar dos veces la misma clase: "Ya reservaste esta clase"', async () => {
            const clase = await crearClase(50);
            expect((await reservar(mensual, clase.id)).status).toBe(201);
            const otra = await reservar(mensual, clase.id);
            expect([otra.status, otra.body.message]).toEqual([409, 'Ya reservaste esta clase']);
            expect(await confirmadas(clase.id)).toBe(1);
        });

        it('QA-09 · una clase que se cruza con otra reservada: "Tienes otra actividad en ese horario"', async () => {
            const a = await crearClase(54);
            const b = await crearClase(54.5);
            expect((await reservar(mensual, a.id)).status).toBe(201);
            const res = await reservar(mensual, b.id);
            expect([res.status, res.body.message]).toEqual([409, 'Tienes otra actividad en ese horario']);
        });

        it('QA-10 · clases que solo se tocan (una termina cuando la otra empieza) no son traslape', async () => {
            const a = await crearClase(58);
            const b = await crearClase(59);
            expect((await reservar(mensual, a.id)).status).toBe(201);
            expect((await reservar(mensual, b.id)).status).toBe(201);
        });
    });

    describe('Criterio 7 · Dos miembros por el último lugar', () => {
        it(`QA-11 · ${CONCURRENTES} reservas simultáneas por 1 lugar: exactamente una 201 y las demás "La clase está llena"`, async () => {
            const clase = await crearClase(70, { cupo: 1 });

            const respuestas = await Promise.all(fila.map((m) => reservar(m, clase.id)));

            expect(respuestas.map((r) => r.status).sort((x, y) => x - y)).toEqual([201, ...Array(CONCURRENTES - 1).fill(409)]);
            for (const r of respuestas.filter((x) => x.status === 409)) expect(r.body.message).toBe('La clase está llena');
            expect(await confirmadas(clase.id)).toBe(1);
        });
    });

    describe('Criterio 8 · Motivos de rechazo, sin cambiar cupos ni créditos', () => {
        it('QA-12 · clase cancelada por el gimnasio: "La clase ya no está disponible"', async () => {
            const clase = await crearClase(80, { estado: EstadoClase.CANCELADA_GIMNASIO });
            const res = await reservar(mensual, clase.id);
            expect([res.status, res.body.message]).toEqual([409, 'La clase ya no está disponible']);
        });

        it('QA-13 · clase que ya empezó: "La clase ya no está disponible"', async () => {
            const clase = await crearClase(-0.25);
            const res = await reservar(mensual, clase.id);
            expect([res.status, res.body.message]).toEqual([409, 'La clase ya no está disponible']);
        });

        it('QA-14 · clase llena: "La clase está llena"', async () => {
            const clase = await crearClase(82, { cupo: 1 });
            expect((await reservar(fila[0], clase.id)).status).toBe(201);
            const res = await reservar(mensual, clase.id);
            expect([res.status, res.body.message]).toEqual([409, 'La clase está llena']);
            expect(await confirmadas(clase.id)).toBe(1);
        });

        it('QA-15 · tipo de clase no incluido en el plan: "Tu plan no incluye este tipo de clase"', async () => {
            const clase = await crearClase(84, { tipo: 'box' });
            const res = await reservar(mensual, clase.id);
            expect([res.status, res.body.message]).toEqual([409, 'Tu plan no incluye este tipo de clase']);
        });

        it('QA-16 · clase después del vencimiento: "Tu membresía no cubre la fecha de esta clase"', async () => {
            const clase = await crearClase(24 * 5); // la membresía de "proxima" vence en 2 días
            const res = await reservar(proxima, clase.id);
            expect([res.status, res.body.message]).toEqual([409, 'Tu membresía no cubre la fecha de esta clase']);
        });

        it('QA-17 · membresía vencida: "Necesitas una membresía vigente para reservar"', async () => {
            const clase = await crearClase(86);
            const res = await reservar(vencida, clase.id);
            expect([res.status, res.body.message]).toEqual([409, 'Necesitas una membresía vigente para reservar']);
        });

        it('QA-18 · ningún rechazo cambió los cupos ni los créditos', async () => {
            const rechazos = await prisma.reserva.count({
                where: { claseId: { in: clases }, miembroId: { in: [vencida.id] } },
            });
            expect(rechazos).toBe(0);
            expect(await creditos(set)).toBe(0); // los mismos 0 de QA-07: el rechazo por créditos no gastó nada
        });

        it('QA-19 · clase inexistente 404, id inválido 400, admin 403 y sin sesión 401', async () => {
            const clase = await crearClase(88);
            expect((await reservar(mensual, randomUUID())).status).toBe(404);
            expect((await http().post('/api/v1/reservas').set(como(mensual)).send({ claseId: 'abc' })).status).toBe(400);
            expect((await http().post('/api/v1/reservas').set({ Authorization: `Bearer ${tokenAdmin}` }).send({ claseId: clase.id })).status).toBe(403);
            expect((await http().post('/api/v1/reservas').send({ claseId: clase.id })).status).toBe(401);
        });
    });

    describe('Criterio 9 · Aviso "Reserva confirmada" por el servicio de avisos (H22)', () => {
        it('QA-20 · la reserva genera el aviso con el título y el mensaje del criterio, una sola vez', async () => {
            const clase = await crearClase(90);
            const res = await reservar(mensual, clase.id);
            expect(res.status).toBe(201);

            const avisos = await prisma.aviso.findMany({
                where: { miembroId: mensual.id, referencia: `reserva-${res.body.id}-confirmada` },
            });
            expect(avisos).toHaveLength(1);
            const [aviso] = avisos;
            expect(aviso).toMatchObject({ titulo: `Reserva confirmada: ${tipo.yoga.nombre}`, moduloOrigen: 'CLASES', estado: 'NO_LEIDO' });
            const fecha = new Intl.DateTimeFormat('es-SV', { timeZone: 'America/El_Salvador', day: '2-digit', month: '2-digit', year: 'numeric' }).format(clase.inicio);
            expect(aviso.mensaje).toMatch(
                new RegExp(
                    `^Tu lugar en ${tipo.yoga.nombre} del ${fecha} de \\d{2}:\\d{2} a \\d{2}:\\d{2} con \\S+ \\S+ quedó reservado\\. ` +
                        'Puedes cancelar hasta 2 horas antes del inicio\\.$',
                ),
            );
        });

        it('QA-21 · un rechazo no genera aviso', async () => {
            const clase = await crearClase(92, { tipo: 'box' });
            const antes = await prisma.aviso.count({ where: { miembroId: mensual.id } });
            expect((await reservar(mensual, clase.id)).status).toBe(409);
            expect(await prisma.aviso.count({ where: { miembroId: mensual.id } })).toBe(antes);
        });
    });
});
