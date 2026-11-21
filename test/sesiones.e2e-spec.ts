/**
 * H9 · BE-9.2: concurrencia del agendamiento.
 *
 * 10 miembros con membresía vigente confirman el mismo bloque al mismo
 * tiempo: exactamente 1 recibe 201 y los otros 9 reciben 409 "Este horario
 * ya no está disponible". Queda una sola sesión, el bloque OCUPADO y un solo
 * cobro PENDIENTE.
 *
 * Contra la base real del docker-compose. Crea sus propios datos (prefijo
 * qa9-) y los borra al terminar. Requisitos: migraciones aplicadas y
 * `npm run db:seed`.
 */
import { randomInt, randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { aFechaLocal, hoyLocal, sumarDias } from '@Common/fechas';
import { PrismaService } from '@Prisma/services';
import { EstadoMembresia, TipoOperacionMembresia, TipoPlan } from '@PrismaClient';

const CANTIDAD = 10;

describe('H9 · POST /sesiones (concurrencia)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    const corrida = randomUUID().slice(0, 6);
    const base = randomInt(100_000, 899_000);
    const miembros: { id: string; usuarioId: string; token: string }[] = [];
    let planId: string;
    let bloqueId: string;
    const hoy = hoyLocal();
    const http = () => request(app.getHttpServer());

    beforeAll(async () => {
        const ref = await Test.createTestingModule({ imports: [AppModule] }).compile();
        app = ref.createNestApplication();
        app.setGlobalPrefix('api/v1');
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
        await app.init();
        prisma = app.get(PrismaService);

        const login = async (email: string) => {
            const res = await http().post('/api/v1/auth/login').send({ email, password: 'Demo1234!' });
            if (res.status !== 200) throw new Error(`No se pudo iniciar sesión con ${email}: corre npm run db:seed`);
            return (res.body as { accessToken: string }).accessToken;
        };

        const { passwordHash } = await prisma.user.findUniqueOrThrow({ where: { email: 'miembro@madlions.com' } });
        const recepcion = await prisma.user.findUniqueOrThrow({ where: { email: 'recepcion@madlions.com' } });
        const entrenador = await prisma.user.findUniqueOrThrow({ where: { email: 'entrenador2@madlions.com' } });

        const plan = await prisma.plan.create({
            data: { nombre: `[QA-H9] Mensual ${corrida}`, tipo: TipoPlan.MENSUAL, precio: 30, duracionDias: 30, beneficios: 'Prueba H9' },
        });
        planId = plan.id;

        for (let i = 0; i < CANTIDAD; i++) {
            const n = base + i;
            const usuario = await prisma.user.create({
                data: {
                    email: `qa9-${corrida}-${i}@test.com`, passwordHash, nombre: 'Prueba',
                    apellido: `QA9 ${corrida} ${i}`, telefono: String(74_000_000 + n).slice(0, 8),
                },
            });
            const miembro = await prisma.miembro.create({
                data: { usuarioId: usuario.id, documento: `${String(n).padStart(8, '0')}-${i % 10}`, codigoMiembro: `MBR-${String(n).padStart(6, '0')}` },
            });
            // Membresía mensual PAGADA que va de hoy a hoy + 29 días: VIGENTE.
            await prisma.membresia.create({
                data: {
                    miembroId: miembro.id, planId, nombrePlan: plan.nombre, tipoPlan: TipoPlan.MENSUAL, precio: 30,
                    tipoOperacion: TipoOperacionMembresia.COMPRA, estado: EstadoMembresia.PAGADA,
                    fechaInicioSolicitada: new Date(`${hoy}T00:00:00Z`),
                    fechaInicio: new Date(`${hoy}T00:00:00Z`),
                    fechaVencimiento: new Date(`${sumarDias(hoy, 29)}T00:00:00Z`),
                    registradaPorId: recepcion.id,
                },
            });
            miembros.push({ id: miembro.id, usuarioId: usuario.id, token: await login(usuario.email) });
        }

        // Bloque dentro de 3 días a las 05:00: cumple la anticipación y la membresía lo cubre.
        const dia = sumarDias(hoy, 3);
        bloqueId = (
            await prisma.bloqueDisponibilidad.create({
                data: { entrenadorId: entrenador.id, inicio: aFechaLocal(dia, '05:00'), fin: aFechaLocal(dia, '06:00'), duracionMin: 60 },
            })
        ).id;
    }, 60_000);

    afterAll(async () => {
        const ids = miembros.map((m) => m.id);
        await prisma.sesionPersonal.deleteMany({ where: { miembroId: { in: ids } } });
        await prisma.cobro.deleteMany({ where: { miembroId: { in: ids } } });
        await prisma.bloqueDisponibilidad.deleteMany({ where: { id: bloqueId } });
        await prisma.membresia.deleteMany({ where: { miembroId: { in: ids } } });
        await prisma.plan.deleteMany({ where: { id: planId } });
        await prisma.miembro.deleteMany({ where: { id: { in: ids } } });
        await prisma.user.deleteMany({ where: { id: { in: miembros.map((m) => m.usuarioId) } } });
        await app.close();
    });

    it('10 confirmaciones simultáneas del mismo bloque: exactamente 1 respuesta 201', async () => {
        const respuestas = await Promise.all(
            miembros.map((m) =>
                http().post('/api/v1/sesiones').set('Authorization', `Bearer ${m.token}`).send({ bloqueId }),
            ),
        );

        const ganadoras = respuestas.filter((r) => r.status === 201);
        const rechazadas = respuestas.filter((r) => r.status === 409);
        expect(ganadoras).toHaveLength(1);
        expect(rechazadas).toHaveLength(CANTIDAD - 1);
        for (const r of rechazadas) {
            expect((r.body as { message: string }).message).toBe('Este horario ya no está disponible');
        }

        const ganadora = ganadoras[0].body as { id: string; cobroId: string };
        const sesiones = await prisma.sesionPersonal.findMany({ where: { bloqueId } });
        expect(sesiones.map((s) => s.id)).toEqual([ganadora.id]);

        const bloque = await prisma.bloqueDisponibilidad.findUniqueOrThrow({ where: { id: bloqueId } });
        expect(bloque.estado).toBe('OCUPADO');

        const cobros = await prisma.cobro.findMany({ where: { miembroId: { in: miembros.map((m) => m.id) } } });
        expect(cobros).toEqual([
            expect.objectContaining({ id: ganadora.cobroId, concepto: 'SESION_ADICIONAL', referenciaTipo: 'SESION', referenciaId: ganadora.id, estado: 'PENDIENTE' }),
        ]);
    }, 30_000);
});