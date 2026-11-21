/**
 * QA-26.1 · Verificación de los criterios de aceptación de H26 (reporte de
 * ocupación de clases grupales) con datos de resultado conocido.
 *
 * Contra la base real del docker-compose. Crea sus propios datos con el
 * prefijo QA26 (4 tipos de clase, 1 plan, 20 miembros con su membresía,
 * 10 clases y sus reservas) y los borra al terminar. Cada bloque `describe`
 * es un criterio de aceptación y cada `it` lleva el ID del caso del documento
 * docs/qa/H26-pruebas-reporte-ocupacion.md, donde está la hoja con los
 * resultados esperados calculados a mano.
 *
 * Requisitos: migraciones aplicadas y `npm run db:seed` (usa a los dos
 * entrenadores, a recepción, al admin y al miembro del seed).
 * Ejecutar: npm run test:e2e -- test/qa-reportes.e2e-spec.ts
 */
import { randomInt, randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { aFechaLocal, hoyLocal, sumarDias } from '@Common/fechas';
import { MENSAJES_REPORTE, sumarMeses } from '@Reportes/services';
import { PrismaService } from '@Prisma/services';
import { EstadoClase, EstadoReserva, TipoPlan } from '@PrismaClient';
import { auditoriaClaseFixture } from './qa/auditoria-clase-fixture.js';

const HORA = 60 * 60 * 1000;
const MIEMBROS = 20;

type Tipo = 'spinning' | 'yoga' | 'crossfit' | 'box';
type Fila = {
    tipoClase: { id: string; nombre: string };
    entrenador: { id: string; nombre: string };
    vecesImpartida: number;
    reservasConfirmadas: number;
    cupoTotal: number;
    ocupacion: number;
    etiqueta: 'BAJA' | 'ALTA' | null;
};

describe('QA-26.1 · Reporte de ocupación de clases grupales (H26)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    const corrida = randomUUID().slice(0, 6);
    const base = randomInt(100_000, 899_000);
    const hoy = hoyLocal();
    const dia = (d: string) => new Date(`${d}T00:00:00Z`);

    const token = {} as Record<'admin' | 'miembro' | 'entrenador' | 'recepcion', string>;
    let carlos: { id: string; nombre: string }; // entrenador@madlions.com
    let ana: { id: string; nombre: string }; // entrenador2@madlions.com
    let recepcionId: string;
    let planId: string;
    const tipo = {} as Record<Tipo, { id: string; nombre: string }>;
    const usuarios: string[] = [];
    const miembros: { id: string; membresiaId: string }[] = [];
    const clases: string[] = [];

    const http = () => request(app.getHttpServer());
    const ocupacion = (query: Record<string, string> = {}, quien: keyof typeof token = 'admin') =>
        http().get('/api/v1/reportes/ocupacion').query(query).set({ Authorization: `Bearer ${token[quien]}` });
    /** Solo las filas de los tipos de clase de esta prueba (la base puede tener otras clases). */
    const propias = (filas: Fila[]) => {
        const ids = new Set(Object.values(tipo).map((t) => t.id));
        return filas.filter((f) => ids.has(f.tipoClase.id));
    };
    /** "Spinning · Carlos Martínez" para comparar sin depender de los IDs. */
    const resumen = (f: Fila) => ({
        clase: `${f.tipoClase.nombre.split(' ')[1]} · ${f.entrenador.nombre}`,
        veces: f.vecesImpartida,
        reservas: f.reservasConfirmadas,
        cupo: f.cupoTotal,
        ocupacion: f.ocupacion,
        etiqueta: f.etiqueta,
    });

    async function login(email: string) {
        const res = await http().post('/api/v1/auth/login').send({ email, password: 'Demo1234!' });
        if (res.status !== 200) throw new Error(`No se pudo iniciar sesión con ${email}: corre npm run db:seed`);
        return (res.body as { accessToken: string }).accessToken;
    }

    /** Clase en un día y hora de El Salvador, de una hora de duración. */
    async function crearClase(datos: {
        tipo: Tipo;
        entrenador: { id: string };
        inicio: Date;
        cupo: number;
        estado?: EstadoClase;
    }) {
        const clase = await prisma.clase.create({
            data: {
                tipoClaseId: tipo[datos.tipo].id,
                entrenadorId: datos.entrenador.id,
                inicio: datos.inicio,
                fin: new Date(datos.inicio.getTime() + HORA),
                cupoMaximo: datos.cupo,
                estado: datos.estado ?? EstadoClase.PROGRAMADA,
                ...await auditoriaClaseFixture(prisma, datos.estado ?? EstadoClase.PROGRAMADA),
                // Cuando DB-7.1 (H7) llegue a develop, una clase cancelada exige además
                // motivoCancelacion, canceladaEn y canceladaPorId (CHECK de la migración).
            },
        });
        clases.push(clase.id);
        return clase;
    }

    /** Reservas de una clase: `n` por estado, cada una de un miembro distinto. */
    async function reservar(claseId: string, cantidades: Partial<Record<EstadoReserva, number>>) {
        let i = 0;
        const data = [];
        for (const [estado, n] of Object.entries(cantidades) as [EstadoReserva, number][]) {
            for (let k = 0; k < n; k++, i++) {
                const m = miembros[i];
                data.push({
                    claseId,
                    miembroId: m.id,
                    membresiaId: m.membresiaId,
                    estado,
                    canceladaEn: estado === EstadoReserva.CONFIRMADA ? null : new Date(),
                });
            }
        }
        await prisma.reserva.createMany({ data });
    }

    beforeAll(async () => {
        const ref = await Test.createTestingModule({ imports: [AppModule] }).compile();
        app = ref.createNestApplication();
        app.setGlobalPrefix('api/v1');
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
        await app.init();
        prisma = app.get(PrismaService);

        const usuario = (email: string) => prisma.user.findUniqueOrThrow({ where: { email } });
        const c = await usuario('entrenador@madlions.com');
        const a = await usuario('entrenador2@madlions.com');
        carlos = { id: c.id, nombre: `${c.nombre} ${c.apellido}` };
        ana = { id: a.id, nombre: `${a.nombre} ${a.apellido}` };
        recepcionId = (await usuario('recepcion@madlions.com')).id;
        const passwordHash = (await usuario('miembro@madlions.com')).passwordHash;

        token.admin = await login('admin@madlions.com');
        token.miembro = await login('miembro@madlions.com');
        token.entrenador = await login('entrenador@madlions.com');
        token.recepcion = await login('recepcion@madlions.com');

        for (const [clave, nombre] of [
            ['spinning', 'Spinning'],
            ['yoga', 'Yoga'],
            ['crossfit', 'Crossfit'],
            ['box', 'Box'],
        ] as const) {
            const t = await prisma.tipoClase.create({ data: { nombre: `QA26 ${nombre} ${corrida}`, descripcion: 'QA-26.1' } });
            tipo[clave] = { id: t.id, nombre: t.nombre };
        }
        planId = (await prisma.plan.create({
            data: { nombre: `[QA-26.1] Mensual ${corrida}`, tipo: TipoPlan.MENSUAL, precio: 35, duracionDias: 30, beneficios: 'QA H26' },
        })).id;

        // Miembros que hacen las reservas (con una membresía pagada, como exige la tabla reserva).
        for (let i = 0; i < MIEMBROS; i++) {
            const n = base + i;
            const u = await prisma.user.create({
                data: {
                    email: `qa26-${corrida}-${i}@test.com`, passwordHash, nombre: 'Prueba', apellido: `QA26 ${i}`,
                    telefono: String(76_000_000 + n).slice(0, 8),
                },
            });
            usuarios.push(u.id);
            const m = await prisma.miembro.create({
                data: {
                    usuarioId: u.id,
                    documento: `${String(n).padStart(8, '0')}-${i % 10}`,
                    codigoMiembro: `MBR-${String(n).padStart(6, '0')}`,
                },
            });
            const membresia = await prisma.membresia.create({
                data: {
                    miembroId: m.id, planId, nombrePlan: 'Mensual', tipoPlan: TipoPlan.MENSUAL, precio: 35,
                    tipoOperacion: 'COMPRA', estado: 'PAGADA',
                    fechaInicioSolicitada: dia(sumarDias(hoy, -40)), fechaInicio: dia(sumarDias(hoy, -40)),
                    fechaVencimiento: dia(sumarDias(hoy, 20)), registradaPorId: recepcionId,
                },
            });
            miembros.push({ id: m.id, membresiaId: membresia.id });
        }

        // Hoja de datos (ver la tabla del documento de QA). Días relativos a hoy, en hora de El Salvador.
        const { CONFIRMADA, CANCELADA_MIEMBRO, CANCELADA_GIMNASIO } = EstadoReserva;
        const c1 = await crearClase({ tipo: 'spinning', entrenador: carlos, inicio: aFechaLocal(sumarDias(hoy, -3), '07:00'), cupo: 20 });
        await reservar(c1.id, { [CONFIRMADA]: 19, [CANCELADA_MIEMBRO]: 1 });
        const c2 = await crearClase({ tipo: 'yoga', entrenador: carlos, inicio: aFechaLocal(sumarDias(hoy, -10), '18:00'), cupo: 10 });
        await reservar(c2.id, { [CONFIRMADA]: 6 });
        const c3 = await crearClase({ tipo: 'yoga', entrenador: carlos, inicio: aFechaLocal(sumarDias(hoy, -3), '18:00'), cupo: 10 });
        await reservar(c3.id, { [CONFIRMADA]: 4, [CANCELADA_MIEMBRO]: 2 });
        const c4 = await crearClase({
            tipo: 'yoga', entrenador: carlos, inicio: aFechaLocal(sumarDias(hoy, -5), '18:00'), cupo: 10,
            estado: EstadoClase.CANCELADA_GIMNASIO,
        });
        await reservar(c4.id, { [CANCELADA_GIMNASIO]: 5 });
        const c5 = await crearClase({ tipo: 'crossfit', entrenador: ana, inicio: aFechaLocal(sumarDias(hoy, -4), '10:00'), cupo: 10 });
        await reservar(c5.id, { [CONFIRMADA]: 2, [CANCELADA_GIMNASIO]: 1 });
        const c6 = await crearClase({ tipo: 'spinning', entrenador: ana, inicio: aFechaLocal(sumarDias(hoy, -3), '09:00'), cupo: 10 });
        await reservar(c6.id, { [CONFIRMADA]: 3 });
        const c7 = await crearClase({ tipo: 'crossfit', entrenador: carlos, inicio: aFechaLocal(sumarDias(hoy, -2), '10:00'), cupo: 10 });
        await reservar(c7.id, { [CONFIRMADA]: 9 });
        const c8 = await crearClase({ tipo: 'box', entrenador: carlos, inicio: aFechaLocal(sumarDias(hoy, -15), '23:00'), cupo: 10 });
        await reservar(c8.id, { [CONFIRMADA]: 1 });
        // No impartidas: una futura y una que está en curso.
        const c9 = await crearClase({ tipo: 'spinning', entrenador: carlos, inicio: aFechaLocal(sumarDias(hoy, 2), '07:00'), cupo: 20 });
        await reservar(c9.id, { [CONFIRMADA]: 5 });
        const enCurso = new Date(Date.now() - HORA / 2);
        enCurso.setUTCSeconds(0, 0);
        const c10 = await crearClase({ tipo: 'spinning', entrenador: carlos, inicio: enCurso, cupo: 20 });
        await reservar(c10.id, { [CONFIRMADA]: 3 });
    });

    afterAll(async () => {
        await prisma.reserva.deleteMany({ where: { claseId: { in: clases } } });
        await prisma.clase.deleteMany({ where: { id: { in: clases } } });
        await prisma.membresia.deleteMany({ where: { miembroId: { in: miembros.map((m) => m.id) } } });
        await prisma.user.deleteMany({ where: { id: { in: usuarios } } });
        await prisma.plan.deleteMany({ where: { id: planId } });
        await prisma.tipoClase.deleteMany({ where: { id: { in: Object.values(tipo).map((t) => t.id) } } });
        await app.close();
    });

    // Resultado esperado de los últimos 30 días, calculado a mano (hoja del documento).
    const ESPERADO_30_DIAS = () => [
        { clase: `Spinning · ${carlos.nombre}`, veces: 1, reservas: 19, cupo: 20, ocupacion: 95, etiqueta: 'ALTA' },
        { clase: `Crossfit · ${carlos.nombre}`, veces: 1, reservas: 9, cupo: 10, ocupacion: 90, etiqueta: 'ALTA' },
        { clase: `Yoga · ${carlos.nombre}`, veces: 2, reservas: 10, cupo: 20, ocupacion: 50, etiqueta: null },
        { clase: `Spinning · ${ana.nombre}`, veces: 1, reservas: 3, cupo: 10, ocupacion: 30, etiqueta: null },
        { clase: `Crossfit · ${ana.nombre}`, veces: 1, reservas: 2, cupo: 10, ocupacion: 20, etiqueta: 'BAJA' },
        { clase: `Box · ${carlos.nombre}`, veces: 1, reservas: 1, cupo: 10, ocupacion: 10, etiqueta: 'BAJA' },
    ];

    describe('Criterio 1 · Por tipo de clase y entrenador: veces, reservas confirmadas y ocupación con un decimal', () => {
        it('QA-01 · cada combinación de tipo y entrenador da los valores de la hoja (95 %, 50 % y 20 %)', async () => {
            const res = await ocupacion();

            expect(res.status).toBe(200);
            expect(propias(res.body.filas).map(resumen)).toEqual(ESPERADO_30_DIAS());
        });

        it('QA-02 · el mismo tipo de clase con dos entrenadores sale en dos filas', async () => {
            const filas = propias((await ocupacion()).body.filas).filter((f) => f.tipoClase.id === tipo.spinning.id);

            expect(filas.map((f) => [f.entrenador.nombre, f.ocupacion])).toEqual([
                [carlos.nombre, 95],
                [ana.nombre, 30],
            ]);
        });

        it('QA-03 · cada fila trae el tipo y el entrenador con id y nombre', async () => {
            const fila = propias((await ocupacion()).body.filas)[0];

            expect(fila.tipoClase).toEqual({ id: tipo.spinning.id, nombre: tipo.spinning.nombre });
            expect(fila.entrenador).toEqual({ id: carlos.id, nombre: carlos.nombre });
        });
    });

    describe('Criterio 2 · Solo clases impartidas y reservas confirmadas', () => {
        it('QA-04 · la clase cancelada por el gimnasio no suma veces ni cupo (Yoga queda en 2 clases y 50 %, no 3 y 33.3 %)', async () => {
            const yoga = propias((await ocupacion()).body.filas).find((f) => f.tipoClase.id === tipo.yoga.id)!;

            expect(yoga).toMatchObject({ vecesImpartida: 2, cupoTotal: 20, ocupacion: 50 });
        });

        it('QA-05 · las reservas canceladas por el miembro y por el gimnasio no cuentan', async () => {
            const filas = propias((await ocupacion()).body.filas);
            const spinning = filas.find((f) => f.tipoClase.id === tipo.spinning.id && f.entrenador.id === carlos.id)!;
            const crossfit = filas.find((f) => f.tipoClase.id === tipo.crossfit.id && f.entrenador.id === ana.id)!;

            expect(spinning.reservasConfirmadas).toBe(19); // 19 confirmadas + 1 cancelada por el miembro
            expect(crossfit.reservasConfirmadas).toBe(2); // 2 confirmadas + 1 cancelada por el gimnasio
        });

        it('QA-06 · las clases futuras y la que está en curso no cuentan como impartidas', async () => {
            const spinning = propias((await ocupacion({ desde: sumarDias(hoy, -29), hasta: sumarDias(hoy, 5) })).body.filas)
                .find((f) => f.tipoClase.id === tipo.spinning.id && f.entrenador.id === carlos.id)!;

            // Si contaran, serían 3 clases, 27 reservas y 60 lugares (45 %).
            expect(spinning).toMatchObject({ vecesImpartida: 1, reservasConfirmadas: 19, cupoTotal: 20, ocupacion: 95 });
        });
    });

    describe('Criterio 3 · Rango: últimos 30 días por defecto, recálculo hasta 12 meses y rechazo de rangos inválidos', () => {
        it('QA-07 · sin fechas usa los últimos 30 días (hoy y los 29 anteriores)', async () => {
            const res = await ocupacion();

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({ desde: sumarDias(hoy, -29), hasta: hoy });
        });

        it('QA-08 · otro rango recalcula: en los últimos 6 días Yoga queda en 1 clase y 40 %, y Box no aparece', async () => {
            const res = await ocupacion({ desde: sumarDias(hoy, -5), hasta: hoy });

            expect(res.status).toBe(200);
            const filas = propias(res.body.filas).map(resumen);
            expect(filas.find((f) => f.clase.startsWith('Yoga'))).toMatchObject({ veces: 1, reservas: 4, cupo: 10, ocupacion: 40 });
            expect(filas.some((f) => f.clase.startsWith('Box'))).toBe(false);
        });

        it('QA-09 · un rango de exactamente 12 meses se acepta y trae las mismas filas', async () => {
            const desde = sumarDias(sumarMeses(hoy, -12), 1);
            const res = await ocupacion({ desde, hasta: hoy });

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({ desde, hasta: hoy });
            expect(propias(res.body.filas).map(resumen)).toEqual(ESPERADO_30_DIAS());
        });

        it('QA-10 · un rango de 12 meses y un día se rechaza', async () => {
            const res = await ocupacion({ desde: sumarMeses(hoy, -12), hasta: hoy });

            expect(res.status).toBe(400);
            expect(res.body.message).toContain(MENSAJES_REPORTE.rangoMaximo);
        });

        it('QA-11 · una fecha de inicio posterior a la de fin se rechaza', async () => {
            const res = await ocupacion({ desde: hoy, hasta: sumarDias(hoy, -1) });

            expect(res.status).toBe(400);
            expect(res.body.message).toContain(MENSAJES_REPORTE.inicioPosterior);
        });

        it('QA-12 · una fecha que no existe o con otro formato se rechaza', async () => {
            expect((await ocupacion({ desde: '2026-02-30', hasta: '2026-03-10' })).status).toBe(400);
            expect((await ocupacion({ desde: '20-11-2026' })).status).toBe(400);
        });

        it('QA-13 · los días se cuentan en hora de El Salvador: una clase a las 23:00 cae en ese día y no en el siguiente (UTC)', async () => {
            const diaBox = sumarDias(hoy, -15); // Box empieza a las 23:00 de ese día = 05:00 UTC del día siguiente
            const eseDia = propias((await ocupacion({ desde: diaBox, hasta: diaBox })).body.filas);
            const siguiente = propias((await ocupacion({ desde: sumarDias(diaBox, 1), hasta: sumarDias(diaBox, 1) })).body.filas);

            expect(eseDia.map(resumen)).toEqual([
                { clase: `Box · ${carlos.nombre}`, veces: 1, reservas: 1, cupo: 10, ocupacion: 10, etiqueta: 'BAJA' },
            ]);
            expect(siguiente).toEqual([]);
        });
    });

    describe('Criterio 4 · Orden de mayor a menor ocupación y etiquetas "Baja ocupación" (< 30 %) y "Alta demanda" (≥ 90 %)', () => {
        it('QA-14 · las filas vienen de mayor a menor ocupación', async () => {
            const valores = (await ocupacion()).body.filas.map((f: Fila) => f.ocupacion);

            expect(valores).toEqual([...valores].sort((a, b) => b - a));
        });

        it('QA-15 · etiquetas en los bordes: 90 % es ALTA, 30 % no lleva etiqueta y 20 % es BAJA', async () => {
            const filas = propias((await ocupacion()).body.filas);
            const etiqueta = (t: Tipo, e: { id: string }) =>
                filas.find((f) => f.tipoClase.id === tipo[t].id && f.entrenador.id === e.id)!.etiqueta;

            expect(etiqueta('crossfit', carlos)).toBe('ALTA'); // 90.0 %
            expect(etiqueta('spinning', carlos)).toBe('ALTA'); // 95.0 %
            expect(etiqueta('yoga', carlos)).toBeNull(); // 50.0 %
            expect(etiqueta('spinning', ana)).toBeNull(); // 30.0 %
            expect(etiqueta('crossfit', ana)).toBe('BAJA'); // 20.0 %
        });
    });

    describe('Criterio 5 · Período sin clases impartidas', () => {
        it('QA-16 · un rango sin clases devuelve la lista vacía', async () => {
            const res = await ocupacion({ desde: '2000-01-01', hasta: '2000-01-31' });

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ desde: '2000-01-01', hasta: '2000-01-31', filas: [] });
        });
    });

    describe('Criterio 7 · Acceso solo para el administrador', () => {
        it.each([
            ['QA-17', 'miembro'],
            ['QA-18', 'entrenador'],
            ['QA-19', 'recepcion'],
        ] as const)('%s · %s recibe 403', async (_id, rol) => {
            expect((await ocupacion({}, rol)).status).toBe(403);
        });

        it('QA-20 · sin sesión recibe 401', async () => {
            expect((await http().get('/api/v1/reportes/ocupacion')).status).toBe(401);
        });
    });
});
