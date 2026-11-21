/**
 * H3 · Consulta de la membresía propia (BE-3.1).
 *
 * Prueba contra la base real del docker-compose, con los dos miembros del
 * seed: cada uno solo puede ver su propia membresía. Crea una membresía para
 * cada uno y las borra al terminar.
 *
 * Requisitos: migraciones aplicadas y `npm run db:seed`.
 * Ejecutar: npm run test:e2e
 */
import { randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { hoyLocal, sumarDias } from '@Common/fechas';
import { PrismaService } from '@Prisma/services';
import { TipoPlan } from '@PrismaClient';

const CORREOS = {
    MARIA: 'miembro@madlions.com',
    DEMO: 'demo@example.com',
    RECEPCION: 'recepcion@madlions.com',
} as const;
type Quien = keyof typeof CORREOS;

describe('H3 · GET /membresias/mia y GET /membresias/:id', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    const token = {} as Record<Quien, string>;
    const miembroId = {} as Record<'MARIA' | 'DEMO', string>;
    const creadas: string[] = [];
    let planId: string;
    const hoy = hoyLocal();
    const dia = (d: string) => new Date(`${d}T00:00:00Z`);

    const http = () => request(app.getHttpServer());
    const como = (quien: Quien) => ({ Authorization: `Bearer ${token[quien]}` });

    beforeAll(async () => {
        const ref = await Test.createTestingModule({ imports: [AppModule] }).compile();
        app = ref.createNestApplication();
        app.setGlobalPrefix('api/v1');
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
        await app.init();
        prisma = app.get(PrismaService);

        for (const [quien, email] of Object.entries(CORREOS) as [Quien, string][]) {
            const res = await http().post('/api/v1/auth/login').send({ email, password: 'Demo1234!' });
            if (res.status !== 200) throw new Error(`No se pudo iniciar sesión con ${email}: corre npm run db:seed`);
            token[quien] = (res.body as { accessToken: string }).accessToken;
        }
        for (const quien of ['MARIA', 'DEMO'] as const) {
            miembroId[quien] = (
                await prisma.miembro.findFirstOrThrow({ where: { usuario: { email: CORREOS[quien] } } })
            ).id;
        }
        const recepcion = await prisma.user.findUniqueOrThrow({ where: { email: CORREOS.RECEPCION } });

        // Plan propio de la prueba (las membresías guardan una copia de sus condiciones).
        planId = (
            await prisma.plan.create({
                data: {
                    nombre: `[QA-H3] Set ${randomUUID().slice(0, 6)}`,
                    tipo: TipoPlan.SET_CLASES,
                    precio: 50,
                    cantidadClases: 8,
                    duracionDias: 30,
                    beneficios: 'Prueba H3',
                },
            })
        ).id;

        // María: Set de 8 clases vigente (vence en 20 días).
        const maria = await prisma.membresia.create({
            data: {
                miembroId: miembroId.MARIA, planId, nombrePlan: 'Set 8 clases', tipoPlan: TipoPlan.SET_CLASES,
                precio: 50, cantidadClases: 8, tipoOperacion: 'COMPRA', estado: 'PAGADA',
                fechaInicioSolicitada: dia(sumarDias(hoy, -9)), fechaInicio: dia(sumarDias(hoy, -9)),
                fechaVencimiento: dia(sumarDias(hoy, 20)), registradaPorId: recepcion.id,
            },
        });
        // Usuario Demo: compra pendiente de pago.
        const demo = await prisma.membresia.create({
            data: {
                miembroId: miembroId.DEMO, planId, nombrePlan: 'Set 8 clases', tipoPlan: TipoPlan.SET_CLASES,
                precio: 50, cantidadClases: 8, tipoOperacion: 'COMPRA',
                fechaInicioSolicitada: dia(hoy), registradaPorId: recepcion.id,
            },
        });
        creadas.push(maria.id, demo.id);
    });

    afterAll(async () => {
        await prisma.membresia.deleteMany({ where: { id: { in: creadas } } });
        await prisma.plan.deleteMany({ where: { id: planId } });
        await app.close();
    });

    describe('GET /membresias/mia', () => {
        it('401 sin sesión', async () => {
            expect((await http().get('/api/v1/membresias/mia')).status).toBe(401);
        });

        it('devuelve el objeto de BE-2.4 del miembro del token', async () => {
            const res = await http().get('/api/v1/membresias/mia').set(como('MARIA'));
            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                estado: 'VIGENTE',
                membresiaId: creadas[0],
                plan: 'Set 8 clases',
                tipoPlan: 'SET_CLASES',
                fechaInicio: sumarDias(hoy, -9),
                fechaVencimiento: sumarDias(hoy, 20),
                diasRestantes: 20,
                creditosTotales: 8,
                creditosDisponibles: 8,
                tiposClaseIds: [],
                renovacion: null,
            });
        });

        it('no acepta un id de miembro: ?miembroId= de otro se ignora y devuelve la propia', async () => {
            const res = await http()
                .get('/api/v1/membresias/mia')
                .query({ miembroId: miembroId.MARIA })
                .set(como('DEMO'));
            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({ estado: 'PENDIENTE_PAGO', membresiaId: creadas[1] });
        });

        it('sin ninguna membresía responde SIN_MEMBRESIA con los demás campos nulos', async () => {
            await prisma.membresia.updateMany({ where: { id: creadas[1] }, data: { miembroId: miembroId.MARIA } });
            try {
                const res = await http().get('/api/v1/membresias/mia').set(como('DEMO'));
                expect(res.status).toBe(200);
                const { estado, ...resto } = res.body as Record<string, unknown>;
                expect(estado).toBe('SIN_MEMBRESIA');
                expect(Object.values(resto).every((v) => v === null)).toBe(true);
                expect(Object.keys(resto)).toHaveLength(10);
            } finally {
                await prisma.membresia.updateMany({ where: { id: creadas[1] }, data: { miembroId: miembroId.DEMO } });
            }
        });

        it('403 para un rol que no es MIEMBRO', async () => {
            expect((await http().get('/api/v1/membresias/mia').set(como('RECEPCION'))).status).toBe(403);
        });
    });

    describe('GET /membresias/:id', () => {
        it('200 con la membresía propia', async () => {
            const res = await http().get(`/api/v1/membresias/${creadas[0]}`).set(como('MARIA'));
            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({ id: creadas[0], estado: 'PAGADA', cantidadClases: 8 });
        });

        it('403 con la membresía de otro miembro (en los dos sentidos)', async () => {
            const demoVeAMaria = await http().get(`/api/v1/membresias/${creadas[0]}`).set(como('DEMO'));
            const mariaVeADemo = await http().get(`/api/v1/membresias/${creadas[1]}`).set(como('MARIA'));
            expect([demoVeAMaria.status, mariaVeADemo.status]).toEqual([403, 403]);
            expect(demoVeAMaria.body.message).toBe('No tienes permiso para ver esta membresía.');
            expect(JSON.stringify(demoVeAMaria.body)).not.toContain('Set 8 clases');
        });

        it('401 sin sesión, 404 si no existe y 400 si el id no es válido', async () => {
            expect((await http().get(`/api/v1/membresias/${creadas[0]}`)).status).toBe(401);
            expect((await http().get(`/api/v1/membresias/${randomUUID()}`).set(como('MARIA'))).status).toBe(404);
            expect((await http().get('/api/v1/membresias/no-es-uuid').set(como('MARIA'))).status).toBe(400);
        });
    });
});
