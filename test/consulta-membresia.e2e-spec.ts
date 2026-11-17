/**
 * QA-3.1 · Pruebas de la consulta del estado de mi membresía (H3)
 *
 * Usa los miembros de prueba del script de datos iniciales (uno por estado,
 * prisma/seed-membresias.ts). Antes de empezar los refresca con la misma
 * función del seed, así las fechas siempre son relativas a hoy. Cada bloque
 * `describe` es un criterio de aceptación de H3.
 *
 * Reservas: la tabla `reserva` llega con H5. Para validar los créditos de un
 * set con 3 reservas confirmadas se simula el único método que las cuenta
 * (MembresiaRepository.contarReservasConfirmadas); todo lo demás es real.
 *
 * Requisitos: migraciones aplicadas y `npm run db:seed`.
 * Ejecutar: npm run test:e2e
 * Detalle de los casos: docs/qa/H3-pruebas-consulta-membresia.md
 */
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { hoyLocal, sumarDias } from '@Common/fechas';
import { MembresiaRepository } from '@Membresias/repositories';
import { PrismaService } from '@Prisma/services';
import {
    MIEMBROS_POR_ESTADO,
    PLANES_DE_PRUEBA,
    cargarMembresiasDePrueba,
    type CasoEstado,
} from '../prisma/seed-membresias.js';

const RESERVAS_CONFIRMADAS_DEL_SET = 3;

describe('QA-3.1 · Consulta del estado de mi membresía (H3)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let miembros: Record<CasoEstado, string>;
    const token = {} as Record<CasoEstado, string>;
    const hoy = hoyLocal();
    const dias = (n: number) => sumarDias(hoy, n);

    const http = () => request(app.getHttpServer());
    const mia = (caso: CasoEstado) =>
        http().get('/api/v1/membresias/mia').set('Authorization', `Bearer ${token[caso]}`);
    const membresiaDe = (caso: CasoEstado) =>
        prisma.membresia.findFirstOrThrow({ where: { miembroId: miembros[caso], tipoOperacion: 'COMPRA' } });

    beforeAll(async () => {
        const ref = await Test.createTestingModule({ imports: [AppModule] }).compile();
        app = ref.createNestApplication();
        app.setGlobalPrefix('api/v1');
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
        await app.init();
        prisma = app.get(PrismaService);

        // Refresca los datos del seed para que las fechas sean relativas a hoy.
        miembros = await cargarMembresiasDePrueba(prisma, hoy);

        const set = await membresiaDe('vigente');
        vi.spyOn(MembresiaRepository.prototype, 'contarReservasConfirmadas').mockImplementation((ids: string[]) =>
            Promise.resolve(new Map(ids.map((id) => [id, id === set.id ? RESERVAS_CONFIRMADAS_DEL_SET : 0]))),
        );

        for (const [caso, { email }] of Object.entries(MIEMBROS_POR_ESTADO) as [CasoEstado, { email: string }][]) {
            const res = await http().post('/api/v1/auth/login').send({ email, password: 'Demo1234!' });
            if (res.status !== 200) throw new Error(`No se pudo iniciar sesión con ${email}: corre npm run db:seed`);
            token[caso] = (res.body as { accessToken: string }).accessToken;
        }
    });

    afterAll(async () => {
        vi.restoreAllMocks();
        await app.close();
    });

    describe('Criterio 1 · Plan, tipo, estado, fechas y días restantes', () => {
        it('QA-01 · Vigente: plan, tipo, estado, inicio, vencimiento y días restantes', async () => {
            const res = await mia('vigente');
            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({
                estado: 'VIGENTE',
                plan: PLANES_DE_PRUEBA.set,
                tipoPlan: 'SET_CLASES',
                fechaInicio: dias(-9),
                fechaVencimiento: dias(20),
                diasRestantes: 20,
            });
        });

        it.each([
            ['proxima', 'PROXIMA_A_VENCER', dias(-27), dias(2), 2],
            ['porIniciar', 'POR_INICIAR', dias(4), dias(33), null],
            ['pendiente', 'PENDIENTE_PAGO', dias(2), null, null],
            ['vencida', 'VENCIDA', dias(-34), dias(-5), null],
        ] as const)('QA-02 · %s → %s con sus fechas', async (caso, estado, inicio, vencimiento, restantes) => {
            const res = await mia(caso);
            expect(res.body).toMatchObject({
                estado,
                plan: PLANES_DE_PRUEBA.mensual,
                tipoPlan: 'MENSUAL',
                fechaInicio: inicio,
                fechaVencimiento: vencimiento,
                diasRestantes: restantes,
            });
        });
    });

    describe('Criterio 2 · En sets, los créditos restantes', () => {
        it(`QA-03 · Set de 8 clases con ${RESERVAS_CONFIRMADAS_DEL_SET} reservas confirmadas → 5 de 8 disponibles`, async () => {
            const res = await mia('vigente');
            expect(res.body).toMatchObject({ creditosTotales: 8, creditosDisponibles: 5 });
        });

        it('QA-04 · los planes que no son set no tienen créditos', async () => {
            expect((await mia('proxima')).body).toMatchObject({ creditosTotales: null, creditosDisponibles: null });
        });
    });

    describe('Criterio 3 · Próxima a vencer', () => {
        it('QA-05 · devuelve el estado y la fecha que muestra el aviso', async () => {
            expect((await mia('proxima')).body).toMatchObject({
                estado: 'PROXIMA_A_VENCER',
                fechaVencimiento: dias(2),
                renovacion: null,
            });
        });
    });

    describe('Criterio 4 · Renovación registrada', () => {
        it('QA-06 · renovación pendiente de pago', async () => {
            expect((await mia('renovacionPendiente')).body).toMatchObject({
                estado: 'VIGENTE',
                fechaVencimiento: dias(9),
                renovacion: { estado: 'PENDIENTE_PAGO', fechaInicio: dias(10) },
            });
        });

        it('QA-07 · renovación pagada (por iniciar) con su fecha de inicio', async () => {
            expect((await mia('renovacionPagada')).body).toMatchObject({
                estado: 'PROXIMA_A_VENCER',
                fechaVencimiento: dias(1),
                renovacion: { estado: 'POR_INICIAR', fechaInicio: dias(2) },
            });
        });
    });

    describe('Criterio 5 · Vencida', () => {
        it('QA-08 · estado VENCIDA con la fecha en que venció', async () => {
            expect((await mia('vencida')).body).toMatchObject({ estado: 'VENCIDA', fechaVencimiento: dias(-5), renovacion: null });
        });
    });

    describe('Criterio 6 · Nunca tuvo una membresía', () => {
        it('QA-09 · SIN_MEMBRESIA con todos los demás campos nulos', async () => {
            const res = await mia('sinMembresia');
            const { estado, ...resto } = res.body as Record<string, unknown>;
            expect(estado).toBe('SIN_MEMBRESIA');
            expect(Object.values(resto).every((v) => v === null)).toBe(true);
        });
    });

    describe('Criterio 7 · Solo la membresía del usuario autenticado', () => {
        it('QA-10 · consultar por id la membresía de otro miembro responde 403', async () => {
            const ajena = await membresiaDe('vigente');
            const res = await http()
                .get(`/api/v1/membresias/${ajena.id}`)
                .set('Authorization', `Bearer ${token.vencida}`);
            expect(res.status).toBe(403);
            expect(res.body.message).toBe('No tienes permiso para ver esta membresía.');
        });

        it('QA-11 · su propia membresía por id sí la puede ver', async () => {
            const propia = await membresiaDe('vencida');
            const res = await http()
                .get(`/api/v1/membresias/${propia.id}`)
                .set('Authorization', `Bearer ${token.vencida}`);
            expect(res.status).toBe(200);
        });

        it('QA-12 · /mia ignora cualquier id de miembro: siempre devuelve la del token', async () => {
            const res = await http()
                .get('/api/v1/membresias/mia')
                .query({ miembroId: miembros.vigente })
                .set('Authorization', `Bearer ${token.sinMembresia}`);
            expect(res.body.estado).toBe('SIN_MEMBRESIA');
        });

        it('QA-13 · sin sesión responde 401', async () => {
            expect((await http().get('/api/v1/membresias/mia')).status).toBe(401);
        });
    });
});
