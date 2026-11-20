/**
 * QA-6.1 · Verificación de los 6 criterios de aceptación de H6 (cancelación de
 * mi reserva).
 *
 * Contra la base real del docker-compose. Crea sus propios datos con el
 * prefijo QA61 (1 tipo de clase, 2 planes, 6 miembros con su membresía y las
 * clases que necesita) y los borra al terminar. Cada bloque `describe` es un
 * criterio de aceptación y cada `it` lleva el ID del caso del documento
 * docs/qa/H6-pruebas-cancelacion-reserva.md.
 *
 * Reloj simulado: el caso de las 2 horas exactas congela solo `Date`
 * (vi.useFakeTimers con toFake: Date), como en las pruebas de H2 y H12.
 *
 * Requisitos: migraciones aplicadas y `npm run db:seed` (usa al entrenador,
 * a recepción, al admin y al miembro del seed).
 * Ejecutar: npm run test:e2e -- test/qa-cancelacion-reservas.e2e-spec.ts
 */
import { randomInt, randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { hoyLocal, sumarDias } from '@Common/fechas';
import { RECHAZOS_CANCELACION } from '@Reservas/services';
import { PrismaService } from '@Prisma/services';
import { EstadoClase, EstadoReserva, TipoPlan } from '@PrismaClient';

const HORA = 60 * 60 * 1000;
const MINUTO = 60 * 1000;

type Miembro = { id: string; usuarioId: string; token: string; membresiaId: string };

describe('QA-6.1 · Cancelación de mi reserva (H6)', () => {
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
    let tipoYoga: { id: string; nombre: string };
    const plan = {} as Record<'mensual' | 'set', string>;
    const clases: string[] = [];
    const usuarios: string[] = [];
    // Miembros por escenario.
    let mensual: Miembro; // Mensual vigente: cancela y vuelve a reservar
    let otro: Miembro; // Mensual vigente: dueño de la reserva que "mensual" intenta cancelar
    let set: Miembro; // Set de 2 clases vigente: crédito devuelto
    const relleno: Miembro[] = []; // ocupan lugares para medir los lugares disponibles

    const http = () => request(app.getHttpServer());
    const como = (m: Miembro) => ({ Authorization: `Bearer ${m.token}` });
    const cancelar = (m: Miembro, reservaId: string) => http().post(`/api/v1/reservas/${reservaId}/cancelar`).set(como(m));
    const reservar = (m: Miembro, claseId: string) => http().post('/api/v1/reservas').set(como(m)).send({ claseId });
    const estadoDe = async (reservaId: string) =>
        (await prisma.reserva.findUniqueOrThrow({ where: { id: reservaId } })).estado;
    const creditos = async (m: Miembro) =>
        (await http().get('/api/v1/membresias/mia').set(como(m))).body.creditosDisponibles as number;
    const lugares = async (m: Miembro, clase: { id: string; inicio: Date }) => {
        const res = await http().get('/api/v1/clases/reservables').query({ semana: hoyLocal(clase.inicio) }).set(como(m));
        return (res.body as { id: string; lugaresDisponibles: number }[]).find((c) => c.id === clase.id)?.lugaresDisponibles;
    };

    async function login(email: string) {
        const res = await http().post('/api/v1/auth/login').send({ email, password: 'Demo1234!' });
        if (res.status !== 200) throw new Error(`No se pudo iniciar sesión con ${email}: corre npm run db:seed`);
        return (res.body as { accessToken: string }).accessToken;
    }

    /** Miembro de prueba con una membresía PAGADA (vigente de hoy-5 a hoy+20) que incluye Yoga. */
    async function crearMiembro(i: number, tipoPlan: 'mensual' | 'set'): Promise<Miembro> {
        const n = base + i;
        const email = `qa61-${corrida}-${i}@test.com`;
        const usuario = await prisma.user.create({
            data: { email, passwordHash, nombre: 'Prueba', apellido: `QA61 ${i}`, telefono: String(74_000_000 + n).slice(0, 8) },
        });
        usuarios.push(usuario.id);
        const miembro = await prisma.miembro.create({
            data: {
                usuarioId: usuario.id,
                documento: `${String(n).padStart(8, '0')}-${i % 10}`,
                codigoMiembro: `MBR-${String(n).padStart(6, '0')}`,
            },
        });
        const esSet = tipoPlan === 'set';
        const membresia = await prisma.membresia.create({
            data: {
                miembroId: miembro.id, planId: plan[tipoPlan], nombrePlan: esSet ? 'Set 2 clases' : 'Mensual',
                tipoPlan: esSet ? TipoPlan.SET_CLASES : TipoPlan.MENSUAL, precio: esSet ? 20 : 35,
                cantidadClases: esSet ? 2 : null, tipoOperacion: 'COMPRA', estado: 'PAGADA',
                fechaInicioSolicitada: dia(sumarDias(hoy, -5)), fechaInicio: dia(sumarDias(hoy, -5)),
                fechaVencimiento: dia(sumarDias(hoy, 20)), registradaPorId: recepcionId,
                tiposClase: { create: [{ tipoClaseId: tipoYoga.id }] },
            },
        });
        return { id: miembro.id, usuarioId: usuario.id, token: await login(email), membresiaId: membresia.id };
    }

    /** Clase de Yoga que empieza en `inicio` (o dentro de `minutos`) y dura una hora. */
    async function crearClase(cuando: { minutos: number } | { inicio: Date }, cupo = 10) {
        const inicio = 'inicio' in cuando ? cuando.inicio : new Date(Date.now() + cuando.minutos * MINUTO);
        if (!('inicio' in cuando)) inicio.setUTCSeconds(0, 0);
        const clase = await prisma.clase.create({
            data: {
                tipoClaseId: tipoYoga.id, entrenadorId, inicio, fin: new Date(inicio.getTime() + HORA),
                cupoMaximo: cupo, estado: EstadoClase.PROGRAMADA,
            },
        });
        clases.push(clase.id);
        return clase;
    }

    /** Reserva creada directo en la base, para preparar escenarios que la API no permitiría (p. ej. clase ya iniciada). */
    async function reservaDirecta(m: Miembro, claseId: string, estado: EstadoReserva = EstadoReserva.CONFIRMADA) {
        return prisma.reserva.create({
            data: {
                claseId, miembroId: m.id, membresiaId: m.membresiaId, estado,
                canceladaEn: estado === EstadoReserva.CONFIRMADA ? null : new Date(),
            },
        });
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

        const t = await prisma.tipoClase.create({ data: { nombre: `QA61 Yoga ${corrida}`, descripcion: 'QA-6.1' } });
        tipoYoga = { id: t.id, nombre: t.nombre };
        plan.mensual = (await prisma.plan.create({
            data: { nombre: `[QA-6.1] Mensual ${corrida}`, tipo: TipoPlan.MENSUAL, precio: 35, duracionDias: 30, beneficios: 'QA H6' },
        })).id;
        plan.set = (await prisma.plan.create({
            data: { nombre: `[QA-6.1] Set ${corrida}`, tipo: TipoPlan.SET_CLASES, precio: 20, cantidadClases: 2, duracionDias: 30, beneficios: 'QA H6' },
        })).id;

        mensual = await crearMiembro(0, 'mensual');
        otro = await crearMiembro(1, 'mensual');
        set = await crearMiembro(2, 'set');
        for (let i = 0; i < 3; i++) relleno.push(await crearMiembro(10 + i, 'mensual'));
    });

    afterAll(async () => {
        vi.useRealTimers();
        const miembros = [mensual, otro, set, ...relleno].filter(Boolean).map((m) => m.id);
        await prisma.aviso.deleteMany({ where: { miembroId: { in: miembros } } });
        await prisma.reserva.deleteMany({ where: { claseId: { in: clases } } });
        await prisma.clase.deleteMany({ where: { id: { in: clases } } });
        await prisma.membresia.deleteMany({ where: { miembroId: { in: miembros } } });
        await prisma.user.deleteMany({ where: { id: { in: usuarios } } });
        await prisma.plan.deleteMany({ where: { id: { in: Object.values(plan) } } });
        await prisma.tipoClase.deleteMany({ where: { id: tipoYoga.id } });
        await app.close();
    });

    describe('Criterio 1 · Con 2 horas o más, la reserva pasa a "Cancelada por el miembro" y los lugares suben en uno', () => {
        it('QA-01 · a 3 horas: 200, queda CANCELADA_MIEMBRO con fecha y la clase tiene un lugar más', async () => {
            const clase = await crearClase({ minutos: 180 });
            const reserva = await reservaDirecta(mensual, clase.id);
            await reservaDirecta(relleno[0], clase.id);
            await reservaDirecta(relleno[1], clase.id);
            expect(await lugares(mensual, clase)).toBe(7);

            const res = await cancelar(mensual, reserva.id);

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ id: reserva.id, estado: EstadoReserva.CANCELADA_MIEMBRO, lugaresDisponibles: 8 });
            const guardada = await prisma.reserva.findUniqueOrThrow({ where: { id: reserva.id } });
            expect(guardada.estado).toBe(EstadoReserva.CANCELADA_MIEMBRO);
            expect(guardada.canceladaEn).toBeInstanceOf(Date);
            expect(await lugares(mensual, clase)).toBe(8);
        });

        it('QA-02 · "Mis reservas" muestra la reserva como Cancelada por el miembro', async () => {
            const clase = await crearClase({ minutos: 300 });
            const reserva = await reservaDirecta(mensual, clase.id);
            await cancelar(mensual, reserva.id);

            const mias = (await http().get('/api/v1/reservas/mias').query({ estado: 'proximas' }).set(como(mensual))).body as {
                id: string;
                estado: string;
            }[];
            expect(mias.find((r) => r.id === reserva.id)?.estado).toBe(EstadoReserva.CANCELADA_MIEMBRO);
        });

        it('QA-03 · a 2 horas exactas (reloj simulado) todavía se puede cancelar', async () => {
            const ahora = new Date(Math.floor(Date.now() / MINUTO) * MINUTO);
            const clase = await crearClase({ inicio: new Date(ahora.getTime() + 2 * HORA) });
            const reserva = await reservaDirecta(mensual, clase.id);

            vi.useFakeTimers({ toFake: ['Date'] });
            vi.setSystemTime(ahora);
            try {
                const res = await cancelar(mensual, reserva.id);
                expect(res.status).toBe(200);
            } finally {
                vi.useRealTimers();
            }
            expect(await estadoDe(reserva.id)).toBe(EstadoReserva.CANCELADA_MIEMBRO);
        });
    });

    describe('Criterio 2 · En un Set de clases mensual el crédito vuelve a estar disponible', () => {
        it('QA-04 · con las 2 clases del set usadas, cancelar una devuelve el crédito y se puede usar en otra reserva', async () => {
            const a = await crearClase({ minutos: 24 * 60 });
            const b = await crearClase({ minutos: 24 * 60 + 120 });
            const c = await crearClase({ minutos: 24 * 60 + 240 });
            const reservaA = await reservaDirecta(set, a.id);
            await reservaDirecta(set, b.id);
            expect(await creditos(set)).toBe(0);

            expect((await cancelar(set, reservaA.id)).status).toBe(200);
            expect(await creditos(set)).toBe(1);

            const otraReserva = await reservar(set, c.id);
            expect(otraReserva.status).toBe(201);
            expect(await creditos(set)).toBe(0);
        });
    });

    describe('Criterio 3 · Después de cancelar se puede volver a reservar la misma clase', () => {
        it('QA-05 · cancelar y reservar de nuevo: 201 con una reserva nueva CONFIRMADA', async () => {
            const clase = await crearClase({ minutos: 48 * 60 });
            const primera = await reservar(mensual, clase.id);
            expect(primera.status).toBe(201);

            expect((await cancelar(mensual, primera.body.id as string)).status).toBe(200);
            const segunda = await reservar(mensual, clase.id);

            expect(segunda.status).toBe(201);
            expect(segunda.body.id).not.toBe(primera.body.id);
            expect(segunda.body.estado).toBe(EstadoReserva.CONFIRMADA);
        });
    });

    describe('Criterio 4 · Con menos de 2 horas o con la clase iniciada se rechaza', () => {
        it('QA-06 · a 1 hora 59 minutos: 409 con el mensaje y la reserva sigue CONFIRMADA', async () => {
            const clase = await crearClase({ minutos: 119 });
            const reserva = await reservaDirecta(mensual, clase.id);

            const res = await cancelar(mensual, reserva.id);

            expect([res.status, res.body.message]).toEqual([409, RECHAZOS_CANCELACION.fueraDePlazo]);
            expect(await estadoDe(reserva.id)).toBe(EstadoReserva.CONFIRMADA);
        });

        it('QA-07 · una clase que ya empezó: 409 con el mismo mensaje', async () => {
            const clase = await crearClase({ minutos: -30 });
            const reserva = await reservaDirecta(mensual, clase.id);

            const res = await cancelar(mensual, reserva.id);

            expect([res.status, res.body.message]).toEqual([409, RECHAZOS_CANCELACION.fueraDePlazo]);
            expect(await estadoDe(reserva.id)).toBe(EstadoReserva.CONFIRMADA);
        });
    });

    describe('Criterio 5 · Una reserva ya cancelada no se cancela otra vez', () => {
        it('QA-08 · cancelar dos veces: la segunda responde 409 "Esta reserva ya fue cancelada"', async () => {
            const clase = await crearClase({ minutos: 72 * 60 });
            const reserva = await reservaDirecta(mensual, clase.id);
            expect((await cancelar(mensual, reserva.id)).status).toBe(200);

            const res = await cancelar(mensual, reserva.id);

            expect([res.status, res.body.message]).toEqual([409, RECHAZOS_CANCELACION.yaCancelada]);
        });

        it('QA-09 · una reserva cancelada por el gimnasio: 409 "Esta reserva ya fue cancelada" y no cambia', async () => {
            const clase = await crearClase({ minutos: 72 * 60 + 120 });
            const reserva = await reservaDirecta(mensual, clase.id, EstadoReserva.CANCELADA_GIMNASIO);

            const res = await cancelar(mensual, reserva.id);

            expect([res.status, res.body.message]).toEqual([409, RECHAZOS_CANCELACION.yaCancelada]);
            expect(await estadoDe(reserva.id)).toBe(EstadoReserva.CANCELADA_GIMNASIO);
        });

        it('QA-10 · 5 cancelaciones simultáneas de la misma reserva: una sola 200 y las demás 409', async () => {
            const clase = await crearClase({ minutos: 96 * 60 });
            const reserva = await reservaDirecta(mensual, clase.id);

            const respuestas = await Promise.all(Array.from({ length: 5 }, () => cancelar(mensual, reserva.id)));

            const estados = respuestas.map((r) => r.status).sort((x, y) => x - y);
            expect(estados).toEqual([200, 409, 409, 409, 409]);
            for (const r of respuestas.filter((x) => x.status === 409)) {
                expect(r.body.message).toBe(RECHAZOS_CANCELACION.yaCancelada);
            }
        });
    });

    describe('Criterio 6 · La reserva de otro miembro no se puede cancelar', () => {
        it('QA-11 · un miembro intenta cancelar la reserva de otro: 403 y la reserva no cambia', async () => {
            const clase = await crearClase({ minutos: 120 * 60 });
            const ajena = await reservaDirecta(otro, clase.id);

            const res = await cancelar(mensual, ajena.id);

            expect(res.status).toBe(403);
            expect(await estadoDe(ajena.id)).toBe(EstadoReserva.CONFIRMADA);
        });

        it('QA-12 · errores de la petición y acceso: no existe 404, id inválido 400, administrador 403, sin sesión 401', async () => {
            const clase = await crearClase({ minutos: 120 * 60 + 120 });
            const reserva = await reservaDirecta(otro, clase.id);

            expect((await cancelar(mensual, randomUUID())).status).toBe(404);
            expect((await cancelar(mensual, 'no-es-un-id')).status).toBe(400);
            expect(
                (await http().post(`/api/v1/reservas/${reserva.id}/cancelar`).set({ Authorization: `Bearer ${tokenAdmin}` })).status,
            ).toBe(403);
            expect((await http().post(`/api/v1/reservas/${reserva.id}/cancelar`)).status).toBe(401);
            expect(await estadoDe(reserva.id)).toBe(EstadoReserva.CONFIRMADA);
        });
    });
});
