/**
 * H5 · Registro de reservas (BE-5.2).
 *
 * Prueba contra la base real del docker-compose. Crea sus propios datos
 * (tipos de clase, plan, 10 miembros con membresía vigente y las clases) y
 * los borra al terminar, para no depender del estado del seed.
 *
 * Incluye la prueba de concurrencia de la definición de terminado: 10
 * peticiones simultáneas por 1 lugar dejan exactamente 1 respuesta 201.
 *
 * Requisitos: migraciones aplicadas y `npm run db:seed` (usa al entrenador y
 * al admin del seed).
 * Ejecutar: npm run test:e2e -- test/reservas.e2e-spec.ts
 */
import { randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { hoyLocal, sumarDias } from '@Common/fechas';
import { PrismaService } from '@Prisma/services';
import { EstadoClase, Rol, TipoPlan } from '@PrismaClient';

const PASSWORD = 'Demo1234!';
const MIEMBROS = 10;
const HORA = 60 * 60 * 1000;

describe('H5 · POST /reservas', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    const marca = randomUUID().slice(0, 6);
    const hoy = hoyLocal();
    const dia = (d: string) => new Date(`${d}T00:00:00Z`);

    const usuarios: { usuarioId: string; miembroId: string; membresiaId: string; token: string }[] = [];
    const clases: string[] = [];
    let tokenAdmin: string;
    let entrenadorId: string;
    let planId: string;
    let tipoIncluido: string;
    let tipoNoIncluido: string;

    const http = () => request(app.getHttpServer());
    const como = (i: number) => ({ Authorization: `Bearer ${usuarios[i].token}` });

    /** Clase de prueba que empieza dentro de `horas` horas y dura una hora. */
    async function crearClase(horas: number, datos: { cupo?: number; tipo?: string; estado?: EstadoClase } = {}) {
        const inicio = new Date(Date.now() + horas * HORA);
        const clase = await prisma.clase.create({
            data: {
                tipoClaseId: datos.tipo ?? tipoIncluido,
                entrenadorId,
                inicio,
                fin: new Date(inicio.getTime() + HORA),
                cupoMaximo: datos.cupo ?? 10,
                estado: datos.estado ?? EstadoClase.PROGRAMADA,
            },
        });
        clases.push(clase.id);
        return clase.id;
    }

    const reservar = (i: number, claseId: string) =>
        http().post('/api/v1/reservas').set(como(i)).send({ claseId });

    beforeAll(async () => {
        const ref = await Test.createTestingModule({ imports: [AppModule] }).compile();
        app = ref.createNestApplication();
        app.setGlobalPrefix('api/v1');
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
        await app.init();
        prisma = app.get(PrismaService);

        entrenadorId = (await prisma.user.findUniqueOrThrow({ where: { email: 'entrenador@madlions.com' } })).id;
        const recepcion = await prisma.user.findUniqueOrThrow({ where: { email: 'recepcion@madlions.com' } });

        tipoIncluido = (await prisma.tipoClase.create({ data: { nombre: `QA-H5 Yoga ${marca}`, descripcion: 'QA' } })).id;
        tipoNoIncluido = (await prisma.tipoClase.create({ data: { nombre: `QA-H5 Box ${marca}`, descripcion: 'QA' } })).id;
        planId = (
            await prisma.plan.create({
                data: {
                    nombre: `[QA-H5] Mensual ${marca}`, tipo: TipoPlan.MENSUAL, precio: 35,
                    duracionDias: 30, beneficios: 'Prueba H5',
                },
            })
        ).id;

        const passwordHash = await bcrypt.hash(PASSWORD, 4);
        for (let i = 0; i < MIEMBROS; i++) {
            const n = String(Math.floor(Math.random() * 1e7)).padStart(7, '0');
            const usuario = await prisma.user.create({
                data: {
                    email: `qa-h5-${marca}-${i}@madlions.com`, passwordHash, nombre: 'QA', apellido: `Reserva ${i}`,
                    telefono: '70000000', rol: Rol.MIEMBRO,
                    miembro: { create: { documento: `9${n}-${i}`, codigoMiembro: `MBR-9${n.slice(0, 4)}${i}` } },
                },
                include: { miembro: true },
            });
            const membresia = await prisma.membresia.create({
                data: {
                    miembroId: usuario.miembro!.id, planId, nombrePlan: 'Mensual', tipoPlan: TipoPlan.MENSUAL,
                    precio: 35, tipoOperacion: 'COMPRA', estado: 'PAGADA',
                    fechaInicioSolicitada: dia(sumarDias(hoy, -5)), fechaInicio: dia(sumarDias(hoy, -5)),
                    fechaVencimiento: dia(sumarDias(hoy, 20)), registradaPorId: recepcion.id,
                    tiposClase: { create: [{ tipoClaseId: tipoIncluido }] },
                },
            });
            const login = await http().post('/api/v1/auth/login').send({ email: usuario.email, password: PASSWORD });
            usuarios.push({
                usuarioId: usuario.id, miembroId: usuario.miembro!.id, membresiaId: membresia.id,
                token: (login.body as { accessToken: string }).accessToken,
            });
        }

        const admin = await http().post('/api/v1/auth/login').send({ email: 'admin@madlions.com', password: PASSWORD });
        if (admin.status !== 200) throw new Error('No se pudo iniciar sesión con el admin: corre npm run db:seed');
        tokenAdmin = (admin.body as { accessToken: string }).accessToken;
    });

    afterAll(async () => {
        const miembroIds = usuarios.map((u) => u.miembroId);
        await prisma.aviso.deleteMany({ where: { miembroId: { in: miembroIds } } });
        await prisma.reserva.deleteMany({ where: { claseId: { in: clases } } });
        await prisma.clase.deleteMany({ where: { id: { in: clases } } });
        await prisma.membresia.deleteMany({ where: { miembroId: { in: miembroIds } } });
        await prisma.user.deleteMany({ where: { id: { in: usuarios.map((u) => u.usuarioId) } } });
        await prisma.plan.deleteMany({ where: { id: planId } });
        await prisma.tipoClase.deleteMany({ where: { id: { in: [tipoIncluido, tipoNoIncluido] } } });
        await app.close();
    });

    it('201: reserva confirmada, baja un lugar y llega el aviso "Reserva confirmada"', async () => {
        const claseId = await crearClase(24, { cupo: 5 });

        const res = await reservar(0, claseId);

        expect(res.status).toBe(201);
        expect(res.body).toEqual({ id: expect.any(String), estado: 'CONFIRMADA', lugaresDisponibles: 4 });
        const aviso = await prisma.aviso.findFirstOrThrow({
            where: { miembroId: usuarios[0].miembroId, referencia: `reserva-${res.body.id}-confirmada` },
        });
        expect(aviso.titulo).toBe(`Reserva confirmada: QA-H5 Yoga ${marca}`);
        expect(aviso.mensaje).toMatch(/^Tu lugar en QA-H5 Yoga .* del \d{2}\/\d{2}\/\d{4} de \d{2}:\d{2} a \d{2}:\d{2} con .* quedó reservado\. Puedes cancelar hasta 2 horas antes del inicio\.$/);

        const mias = await http().get('/api/v1/reservas/mias').set(como(0));
        expect(mias.body.map((r: { id: string }) => r.id)).toContain(res.body.id);
    });

    it('409 "Ya reservaste esta clase" al reservar dos veces', async () => {
        const claseId = await crearClase(26);
        expect((await reservar(1, claseId)).status).toBe(201);
        const otra = await reservar(1, claseId);
        expect(otra.status).toBe(409);
        expect(otra.body.message).toBe('Ya reservaste esta clase');
    });

    it('409 "Tienes otra actividad en ese horario" con una clase que se traslapa', async () => {
        const a = await crearClase(30);
        const b = await crearClase(30.5);
        expect((await reservar(2, a)).status).toBe(201);
        const res = await reservar(2, b);
        expect([res.status, res.body.message]).toEqual([409, 'Tienes otra actividad en ese horario']);
    });

    it('409 por tipo no incluido, clase cancelada o ya iniciada; 404 si no existe; 400 si no es UUID', async () => {
        const otroTipo = await crearClase(40, { tipo: tipoNoIncluido });
        const cancelada = await crearClase(42, { estado: EstadoClase.CANCELADA_GIMNASIO });
        const iniciada = await crearClase(-0.5);

        expect((await reservar(3, otroTipo)).body.message).toBe('Tu plan no incluye este tipo de clase');
        expect((await reservar(3, cancelada)).body.message).toBe('La clase ya no está disponible');
        expect((await reservar(3, iniciada)).body.message).toBe('La clase ya no está disponible');
        expect((await reservar(3, randomUUID())).status).toBe(404);
        expect((await http().post('/api/v1/reservas').set(como(3)).send({ claseId: 'x' })).status).toBe(400);
    });

    it('409 "Tu membresía no cubre la fecha de esta clase" después del vencimiento', async () => {
        const lejos = await crearClase(24 * 25);
        expect((await reservar(4, lejos)).body.message).toBe('Tu membresía no cubre la fecha de esta clase');
    });

    it('403 para el administrador y 401 sin sesión', async () => {
        const claseId = await crearClase(50);
        const admin = await http().post('/api/v1/reservas').set({ Authorization: `Bearer ${tokenAdmin}` }).send({ claseId });
        expect(admin.status).toBe(403);
        expect((await http().post('/api/v1/reservas').send({ claseId })).status).toBe(401);
    });

    it('concurrencia: 10 miembros por 1 lugar → exactamente un 201 y nueve "La clase está llena"', async () => {
        const claseId = await crearClase(60, { cupo: 1 });

        const respuestas = await Promise.all(usuarios.map((_, i) => reservar(i, claseId)));

        const codigos = respuestas.map((r) => r.status).sort((a, b) => a - b);
        expect(codigos).toEqual([201, ...Array(MIEMBROS - 1).fill(409)]);
        for (const r of respuestas.filter((x) => x.status === 409)) {
            expect(r.body.message).toBe('La clase está llena');
        }
        expect(await prisma.reserva.count({ where: { claseId, estado: 'CONFIRMADA' } })).toBe(1);
    });
});
