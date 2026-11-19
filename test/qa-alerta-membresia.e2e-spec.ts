/**
 * QA-11.1 · Criterios de H11 (alerta de membresía vencida).
 *
 * Contra la base real del docker-compose:
 * - El criterio 1 usa los miembros del seed de H3 (uno por estado), solo lectura.
 * - Los ingresos usan miembros propios (prefijo qa11-) con membresías creadas
 *   en cada estado, para no chocar con ingresos abiertos de pruebas manuales.
 *   Se borran al terminar.
 *
 * Requisitos: migraciones aplicadas y `npm run db:seed`.
 */
import { randomInt, randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { hoyLocal, sumarDias } from '@Common/fechas';
import { PrismaService } from '@Prisma/services';
import { EstadoMembresia, TipoOperacionMembresia, TipoPlan } from '@PrismaClient';

const MOTIVO_REQUERIDO = 'Se requiere un motivo de excepción';
const MOTIVO = 'Pagará la renovación mañana en recepción';

type Caso = 'vigente' | 'proxima' | 'vencida' | 'pendiente' | 'sin' | 'daypassHoy' | 'daypassAyer';

describe('QA-11.1 · Alerta de membresía vencida (H11)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    const corrida = randomUUID().slice(0, 6);
    let siguiente = randomInt(100_000, 899_000);
    const hoy = hoyLocal();
    const usuarios: string[] = [];
    const miembros: string[] = [];
    const planes: string[] = [];
    let planMensual: string;
    let planDaypass: string;
    let passwordHash: string;
    let recepcionId: string;
    let token: string;

    const http = () => request(app.getHttpServer());
    const dia = (n: number) => new Date(`${sumarDias(hoy, n)}T00:00:00Z`);
    const ingreso = (miembroId: string, extra: Record<string, unknown> = {}) =>
        http().post('/api/v1/accesos/ingreso').set('Authorization', `Bearer ${token}`).send({ miembroId, ...extra });
    const buscar = (q: string) =>
        http().get(`/api/v1/miembros/buscar?q=${encodeURIComponent(q)}`).set('Authorization', `Bearer ${token}`);

    async function login(email: string): Promise<string> {
        const res = await http().post('/api/v1/auth/login').send({ email, password: 'Demo1234!' });
        if (res.status !== 200) throw new Error(`No se pudo iniciar sesión con ${email}: corre npm run db:seed`);
        return (res.body as { accessToken: string }).accessToken;
    }

    /** Miembro nuevo con la membresía que corresponde al caso. */
    async function crearMiembro(caso: Caso): Promise<{ id: string; documento: string }> {
        const n = siguiente++;
        const usuario = await prisma.user.create({
            data: {
                email: `qa11-${corrida}-${n}@test.com`, passwordHash, nombre: 'Prueba',
                apellido: `QA11 ${corrida} ${n}`, telefono: String(77_000_000 + n).slice(0, 8),
            },
        });
        usuarios.push(usuario.id);
        const documento = `${String(n).padStart(8, '0')}-${n % 10}`;
        const miembro = await prisma.miembro.create({
            data: { usuarioId: usuario.id, documento, codigoMiembro: `MBR-${String(n).padStart(6, '0')}` },
        });
        miembros.push(miembro.id);

        const base = {
            miembroId: miembro.id, tipoOperacion: TipoOperacionMembresia.COMPRA, registradaPorId: recepcionId,
        };
        const mensual = { ...base, planId: planMensual, nombrePlan: `[QA-H11] Mensual ${corrida}`, tipoPlan: TipoPlan.MENSUAL, precio: 30 };
        const daypass = { ...base, planId: planDaypass, nombrePlan: `[QA-H11] Daypass ${corrida}`, tipoPlan: TipoPlan.DAYPASS, precio: 5 };
        const pagada = (desde: number, hasta: number) => ({
            estado: EstadoMembresia.PAGADA, fechaInicioSolicitada: dia(desde), fechaInicio: dia(desde), fechaVencimiento: dia(hasta),
        });

        const datos = {
            vigente: { ...mensual, ...pagada(-1, 20) },
            proxima: { ...mensual, ...pagada(-27, 2) },
            vencida: { ...mensual, ...pagada(-40, -11) },
            pendiente: { ...mensual, estado: EstadoMembresia.PENDIENTE_PAGO, fechaInicioSolicitada: dia(0) },
            daypassHoy: { ...daypass, ...pagada(0, 0) },
            daypassAyer: { ...daypass, ...pagada(-1, -1) },
            sin: null,
        }[caso];
        if (datos) await prisma.membresia.create({ data: datos });
        return { id: miembro.id, documento };
    }

    beforeAll(async () => {
        const ref = await Test.createTestingModule({ imports: [AppModule] }).compile();
        app = ref.createNestApplication();
        app.setGlobalPrefix('api/v1');
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
        await app.init();
        prisma = app.get(PrismaService);

        const recepcion = await prisma.user.findUniqueOrThrow({ where: { email: 'recepcion@madlions.com' } });
        recepcionId = recepcion.id;
        passwordHash = recepcion.passwordHash;
        token = await login('recepcion@madlions.com');

        planMensual = (await prisma.plan.create({
            data: { nombre: `[QA-H11] Mensual ${corrida}`, tipo: TipoPlan.MENSUAL, precio: 30, duracionDias: 30, beneficios: 'Prueba H11' },
        })).id;
        planDaypass = (await prisma.plan.create({
            data: { nombre: `[QA-H11] Daypass ${corrida}`, tipo: TipoPlan.DAYPASS, precio: 5, duracionDias: 1, beneficios: 'Prueba H11' },
        })).id;
        planes.push(planMensual, planDaypass);
    }, 60_000);

    afterAll(async () => {
        await prisma.registroAcceso.deleteMany({ where: { miembroId: { in: miembros } } });
        await prisma.membresia.deleteMany({ where: { miembroId: { in: miembros } } });
        await prisma.plan.deleteMany({ where: { id: { in: planes } } });
        await prisma.miembro.deleteMany({ where: { id: { in: miembros } } });
        await prisma.user.deleteMany({ where: { id: { in: usuarios } } });
        await app.close();
    });

    it.each([
        ['10000001-1', 'VIGENTE', true],
        ['10000002-1', 'PROXIMA_A_VENCER', true],
        ['10000004-1', 'PENDIENTE_PAGO', false],
        ['10000005-1', 'VENCIDA', true],
        ['10000008-1', 'SIN_MEMBRESIA', false],
    ])('C1 · el miembro del seed %s aparece como %s con su fecha de vencimiento', async (documento, estado, conFecha) => {
        const res = await buscar(documento);

        expect(res.status).toBe(200);
        const [miembro] = res.body as { estadoMembresia: string; fechaVencimiento: string | null }[];
        expect(miembro.estadoMembresia).toBe(estado);
        if (conFecha) expect(miembro.fechaVencimiento).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        else expect(miembro.fechaVencimiento).toBeNull();
    }, 20_000);

    it('C2 · próxima a vencer: entra sin motivo', async () => {
        const miembro = await crearMiembro('proxima');

        const res = await ingreso(miembro.id);

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ estadoMembresia: 'PROXIMA_A_VENCER' });
    }, 20_000);

    it('C2 · vigente: entra sin motivo y no se guarda motivo', async () => {
        const miembro = await crearMiembro('vigente');

        const res = await ingreso(miembro.id, { motivoExcepcion: MOTIVO });

        expect(res.status).toBe(201);
        const registro = await prisma.registroAcceso.findUniqueOrThrow({ where: { id: (res.body as { id: string }).id } });
        expect(registro).toMatchObject({ estadoMembresia: 'VIGENTE', motivoExcepcion: null });
    }, 20_000);

    it.each(['vencida', 'pendiente', 'sin'] as const)(
        'C3 y C5 · %s: la petición directa sin motivo responde 409 y no registra',
        async (caso) => {
            const miembro = await crearMiembro(caso);

            const res = await ingreso(miembro.id);

            expect(res.status).toBe(409);
            expect((res.body as { message: string }).message).toBe(MOTIVO_REQUERIDO);
            expect(await prisma.registroAcceso.count({ where: { miembroId: miembro.id } })).toBe(0);
        },
        20_000,
    );

    it('C5 · un motivo de 9 caracteres también responde 409', async () => {
        const miembro = await crearMiembro('vencida');
        const res = await ingreso(miembro.id, { motivoExcepcion: '123456789' });
        expect(res.status).toBe(409);
        expect((res.body as { message: string }).message).toBe(MOTIVO_REQUERIDO);
    }, 20_000);

    it('C5 · el estado no se puede mandar en la petición', async () => {
        const miembro = await crearMiembro('vencida');
        const res = await ingreso(miembro.id, { estadoMembresia: 'VIGENTE' });
        expect(res.status).toBe(400);
        expect(await prisma.registroAcceso.count({ where: { miembroId: miembro.id } })).toBe(0);
    }, 20_000);

    it.each([
        ['vencida', 'VENCIDA'],
        ['pendiente', 'PENDIENTE_PAGO'],
        ['sin', 'SIN_MEMBRESIA'],
    ] as const)('C4 · %s con motivo de 10 a 250: registra el ingreso y guarda el motivo con el usuario', async (caso, estado) => {
        const miembro = await crearMiembro(caso);

        const res = await ingreso(miembro.id, { motivoExcepcion: `  ${MOTIVO}  ` });

        expect(res.status).toBe(201);
        const registro = await prisma.registroAcceso.findUniqueOrThrow({ where: { id: (res.body as { id: string }).id } });
        expect(registro).toMatchObject({
            estado: 'DENTRO', estadoMembresia: estado, motivoExcepcion: MOTIVO, registradoPorId: recepcionId,
        });
    }, 20_000);

    it('C6 · Daypass el día del pago: Vigente y entra sin motivo', async () => {
        const miembro = await crearMiembro('daypassHoy');

        const busqueda = await buscar(miembro.documento);
        expect((busqueda.body as { estadoMembresia: string }[])[0].estadoMembresia).toBe('VIGENTE');
        expect((await ingreso(miembro.id)).status).toBe(201);
    }, 20_000);

    it('C6 · Daypass al día siguiente del pago: Vencida y pide motivo', async () => {
        const miembro = await crearMiembro('daypassAyer');

        const busqueda = await buscar(miembro.documento);
        expect((busqueda.body as { estadoMembresia: string }[])[0].estadoMembresia).toBe('VENCIDA');
        const res = await ingreso(miembro.id);
        expect(res.status).toBe(409);
        expect((res.body as { message: string }).message).toBe(MOTIVO_REQUERIDO);
    }, 20_000);
});