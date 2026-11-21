/**
 * QA-9.1 · Criterios de H9 (agendar sesión con un entrenador).
 *
 * Contra la base real del docker-compose. Crea sus propios miembros
 * (prefijo qa9q-), membresías, bloques del entrenador entrenador2 y una clase
 * reservada, y los borra al terminar. Si cambia el precio de la clase
 * puntual, lo restaura. La concurrencia (criterio 7) está en
 * sesiones.e2e-spec.ts.
 *
 * Requisitos: migraciones aplicadas y `npm run db:seed`.
 */
import { randomInt, randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { aFechaLocal, hoyLocal, sumarDias } from '@Common/fechas';
import { PrismaService } from '@Prisma/services';
import { EstadoBloque, EstadoMembresia, TipoOperacionMembresia, TipoPlan } from '@PrismaClient';

const MINUTO = 60_000;
const CLAVE_PRECIO = 'precio_clase_puntual';
const MENSAJES = {
    anticipacion: 'Solo puedes agendar con al menos 2 horas de anticipación',
    membresia: 'Necesitas una membresía vigente para agendar',
    limite: 'Ya tienes 5 sesiones agendadas que no han empezado',
    traslape: 'Ya tienes otra sesión agendada en ese horario',
    traslapeClase: 'Ya tienes una clase reservada en ese horario',
};

describe('QA-9.1 · Agendar sesión con un entrenador (H9)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    const corrida = randomUUID().slice(0, 6);
    let siguiente = randomInt(100_000, 899_000);
    const hoy = hoyLocal();
    const usuarios: string[] = [];
    const miembros: string[] = [];
    const bloques: string[] = [];
    const clases: string[] = [];
    let tipoClaseId: string | undefined;
    let planId: string;
    let recepcionId: string;
    let entrenadorId: string;
    let otroEntrenadorId: string;
    let passwordHash: string;
    let tokenAdmin: string;
    let tokenEntrenador: string;
    let precioOriginal: string | null;
    let precio: number;

    const http = () => request(app.getHttpServer());
    const dia = (n: number) => new Date(`${sumarDias(hoy, n)}T00:00:00Z`);
    const agendar = (token: string, bloqueId: string) =>
        http().post('/api/v1/sesiones').set('Authorization', `Bearer ${token}`).send({ bloqueId });

    async function login(email: string): Promise<string> {
        const res = await http().post('/api/v1/auth/login').send({ email, password: 'Demo1234!' });
        if (res.status !== 200) throw new Error(`No se pudo iniciar sesión con ${email}: corre npm run db:seed`);
        return (res.body as { accessToken: string }).accessToken;
    }

    /** Miembro nuevo con una membresía mensual PAGADA de hoy + desde a hoy + hasta (null = sin membresía). */
    async function crearMiembro(vigencia: { desde: number; hasta: number } | null) {
        const n = siguiente++;
        const usuario = await prisma.user.create({
            data: {
                email: `qa9q-${corrida}-${n}@test.com`, passwordHash, nombre: 'Prueba',
                apellido: `QA9 ${corrida} ${n}`, telefono: String(75_000_000 + n).slice(0, 8),
            },
        });
        usuarios.push(usuario.id);
        const miembro = await prisma.miembro.create({
            data: { usuarioId: usuario.id, documento: `${String(n).padStart(8, '0')}-${n % 10}`, codigoMiembro: `MBR-${String(n).padStart(6, '0')}` },
        });
        miembros.push(miembro.id);
        let membresiaId: string | null = null;
        if (vigencia) {
            membresiaId = (
                await prisma.membresia.create({
                    data: {
                        miembroId: miembro.id, planId, nombrePlan: `[QA-H9] ${corrida}`, tipoPlan: TipoPlan.MENSUAL, precio: 30,
                        tipoOperacion: TipoOperacionMembresia.COMPRA, estado: EstadoMembresia.PAGADA,
                        fechaInicioSolicitada: dia(vigencia.desde), fechaInicio: dia(vigencia.desde),
                        fechaVencimiento: dia(vigencia.hasta), registradaPorId: recepcionId,
                    },
                })
            ).id;
        }
        return { id: miembro.id, membresiaId, token: await login(usuario.email) };
    }

    async function crearBloque(inicio: Date, estado: EstadoBloque = EstadoBloque.DISPONIBLE) {
        const bloque = await prisma.bloqueDisponibilidad.create({
            data: { entrenadorId, inicio, fin: new Date(inicio.getTime() + 60 * MINUTO), duracionMin: 60, estado },
        });
        bloques.push(bloque.id);
        return bloque.id;
    }

    beforeAll(async () => {
        const ref = await Test.createTestingModule({ imports: [AppModule] }).compile();
        app = ref.createNestApplication();
        app.setGlobalPrefix('api/v1');
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
        await app.init();
        prisma = app.get(PrismaService);

        passwordHash = (await prisma.user.findUniqueOrThrow({ where: { email: 'miembro@madlions.com' } })).passwordHash;
        recepcionId = (await prisma.user.findUniqueOrThrow({ where: { email: 'recepcion@madlions.com' } })).id;
        entrenadorId = (await prisma.user.findUniqueOrThrow({ where: { email: 'entrenador2@madlions.com' } })).id;
        otroEntrenadorId = (await prisma.user.findUniqueOrThrow({ where: { email: 'entrenador@madlions.com' } })).id;
        tokenAdmin = await login('admin@madlions.com');
        tokenEntrenador = await login('entrenador2@madlions.com');
        planId = (
            await prisma.plan.create({
                data: { nombre: `[QA-H9] Mensual ${corrida}`, tipo: TipoPlan.MENSUAL, precio: 30, duracionDias: 30, beneficios: 'Prueba H9' },
            })
        ).id;
        precioOriginal = (await prisma.configuracion.findUnique({ where: { clave: CLAVE_PRECIO } }))?.valor ?? null;
        precio = Number(precioOriginal ?? '10.00');
    }, 60_000);

    afterAll(async () => {
        if (precioOriginal === null) await prisma.configuracion.deleteMany({ where: { clave: CLAVE_PRECIO } });
        else await prisma.configuracion.update({ where: { clave: CLAVE_PRECIO }, data: { valor: precioOriginal } });
        await prisma.sesionPersonal.deleteMany({ where: { miembroId: { in: miembros } } });
        await prisma.cobro.deleteMany({ where: { miembroId: { in: miembros } } });
        await prisma.reserva.deleteMany({ where: { miembroId: { in: miembros } } });
        await prisma.clase.deleteMany({ where: { id: { in: clases } } });
        if (tipoClaseId) await prisma.tipoClase.deleteMany({ where: { id: tipoClaseId } });
        await prisma.bloqueDisponibilidad.deleteMany({ where: { id: { in: bloques } } });
        await prisma.membresia.deleteMany({ where: { miembroId: { in: miembros } } });
        await prisma.plan.deleteMany({ where: { id: planId } });
        await prisma.miembro.deleteMany({ where: { id: { in: miembros } } });
        await prisma.user.deleteMany({ where: { id: { in: usuarios } } });
        await app.close();
    });

    it('C1 · lista entrenadores y solo bloques DISPONIBLES entre ahora + 2 h y 14 días', async () => {
        const visible = await crearBloque(aFechaLocal(sumarDias(hoy, 2), '06:00'));
        const pronto = await crearBloque(new Date(Date.now() + 119 * MINUTO));
        const lejano = await crearBloque(aFechaLocal(sumarDias(hoy, 15), '06:00'));
        const ocupado = await crearBloque(aFechaLocal(sumarDias(hoy, 2), '07:00'), EstadoBloque.OCUPADO);
        const miembro = await crearMiembro({ desde: 0, hasta: 29 });

        const lista = await http().get('/api/v1/entrenadores').set('Authorization', `Bearer ${miembro.token}`);
        expect(lista.status).toBe(200);
        expect(lista.body).toContainEqual({ id: entrenadorId, nombre: 'Ana Hernández' });

        const res = await http().get(`/api/v1/entrenadores/${entrenadorId}/bloques`).set('Authorization', `Bearer ${miembro.token}`);
        expect(res.status).toBe(200);
        const ids = (res.body as { bloques: { id: string }[] }).bloques.map((b) => b.id);
        expect(ids).toContain(visible);
        expect(ids).not.toContain(pronto);
        expect(ids).not.toContain(lejano);
        expect(ids).not.toContain(ocupado);
        expect(Number((res.body as { precioClasePuntual: string }).precioClasePuntual)).toBe(precio);
    }, 20_000);

    it('C2, C3 y C4 · agenda: sesión AGENDADA, bloque OCUPADO, en Mis sesiones y con cobro PENDIENTE', async () => {
        const miembro = await crearMiembro({ desde: 0, hasta: 29 });
        const bloqueId = await crearBloque(aFechaLocal(sumarDias(hoy, 3), '06:00'));

        const res = await agendar(miembro.token, bloqueId);

        expect(res.status).toBe(201);
        const body = res.body as { id: string; entrenador: string; precio: string; cobroId: string };
        expect(body).toMatchObject({ entrenador: 'Ana Hernández', cobroId: expect.any(String) as string });
        expect(Number(body.precio)).toBe(precio);

        const sesion = await prisma.sesionPersonal.findUniqueOrThrow({ where: { id: body.id } });
        expect(sesion).toMatchObject({ estado: 'AGENDADA', asistencia: 'SIN_REGISTRAR', miembroId: miembro.id, entrenadorId, bloqueId });
        expect((await prisma.bloqueDisponibilidad.findUniqueOrThrow({ where: { id: bloqueId } })).estado).toBe('OCUPADO');

        const cobro = await prisma.cobro.findUniqueOrThrow({ where: { id: body.cobroId } });
        expect(cobro).toMatchObject({ concepto: 'SESION_ADICIONAL', estado: 'PENDIENTE', referenciaTipo: 'SESION', referenciaId: body.id, miembroId: miembro.id });
        expect(cobro.monto.toNumber()).toBe(precio);

        const mias = await http().get('/api/v1/sesiones/mias').set('Authorization', `Bearer ${miembro.token}`);
        expect(mias.status).toBe(200);
        expect(mias.body).toEqual([expect.objectContaining({ id: body.id, cobro: { id: body.cobroId, estado: 'PENDIENTE' } })]);
    }, 20_000);

    it('C5 · bloque a 1 h 59 min: 409 y el bloque sigue DISPONIBLE', async () => {
        const miembro = await crearMiembro({ desde: 0, hasta: 29 });
        const bloqueId = await crearBloque(new Date(Date.now() + 119 * MINUTO));

        const res = await agendar(miembro.token, bloqueId);

        expect(res.status).toBe(409);
        expect((res.body as { message: string }).message).toBe(MENSAJES.anticipacion);
        expect((await prisma.bloqueDisponibilidad.findUniqueOrThrow({ where: { id: bloqueId } })).estado).toBe('DISPONIBLE');
    }, 20_000);

    it('C5 · bloque a 2 h 05 min: se agenda', async () => {
        const miembro = await crearMiembro({ desde: 0, hasta: 29 });
        const bloqueId = await crearBloque(new Date(Date.now() + 125 * MINUTO));
        expect((await agendar(miembro.token, bloqueId)).status).toBe(201);
    }, 20_000);

    it('C6 · sexta sesión pendiente: 409, sin sesión ni cobro y el bloque sigue DISPONIBLE', async () => {
        const miembro = await crearMiembro({ desde: 0, hasta: 29 });
        const ids: string[] = [];
        for (let d = 1; d <= 6; d++) ids.push(await crearBloque(aFechaLocal(sumarDias(hoy, d), '08:00')));

        for (const bloqueId of ids.slice(0, 5)) {
            expect((await agendar(miembro.token, bloqueId)).status).toBe(201);
        }
        const sexta = await agendar(miembro.token, ids[5]);

        expect(sexta.status).toBe(409);
        expect((sexta.body as { message: string }).message).toBe(MENSAJES.limite);
        expect(await prisma.sesionPersonal.count({ where: { miembroId: miembro.id } })).toBe(5);
        expect(await prisma.cobro.count({ where: { miembroId: miembro.id } })).toBe(5);
        expect((await prisma.bloqueDisponibilidad.findUniqueOrThrow({ where: { id: ids[5] } })).estado).toBe('DISPONIBLE');
    }, 30_000);

    it('C6 · traslape con otra sesión: 409 y el bloque sigue DISPONIBLE', async () => {
        const miembro = await crearMiembro({ desde: 0, hasta: 29 });
        const primero = await crearBloque(aFechaLocal(sumarDias(hoy, 4), '09:00'));
        const cruzado = await crearBloque(aFechaLocal(sumarDias(hoy, 4), '09:30'));

        expect((await agendar(miembro.token, primero)).status).toBe(201);
        const res = await agendar(miembro.token, cruzado);

        expect(res.status).toBe(409);
        expect((res.body as { message: string }).message).toBe(MENSAJES.traslape);
        expect((await prisma.bloqueDisponibilidad.findUniqueOrThrow({ where: { id: cruzado } })).estado).toBe('DISPONIBLE');
    }, 20_000);

    it('C6 · traslape con una clase reservada: 409 y el bloque sigue DISPONIBLE', async () => {
        const miembro = await crearMiembro({ desde: 0, hasta: 29 });
        tipoClaseId = (
            await prisma.tipoClase.create({ data: { nombre: `QA9 ${corrida}`, descripcion: 'Clase de prueba de QA-9.1' } })
        ).id;
        const clase = await prisma.clase.create({
            data: {
                tipoClaseId, entrenadorId: otroEntrenadorId, cupoMaximo: 10,
                inicio: aFechaLocal(sumarDias(hoy, 5), '09:00'), fin: aFechaLocal(sumarDias(hoy, 5), '10:00'),
            },
        });
        clases.push(clase.id);
        await prisma.reserva.create({ data: { claseId: clase.id, miembroId: miembro.id, membresiaId: miembro.membresiaId! } });
        const bloqueId = await crearBloque(aFechaLocal(sumarDias(hoy, 5), '09:30'));

        const res = await agendar(miembro.token, bloqueId);

        expect(res.status).toBe(409);
        expect((res.body as { message: string }).message).toBe(MENSAJES.traslapeClase);
        expect((await prisma.bloqueDisponibilidad.findUniqueOrThrow({ where: { id: bloqueId } })).estado).toBe('DISPONIBLE');
    }, 20_000);

    it.each([
        ['vencida', { desde: -40, hasta: -11 }],
        ['que vence antes de la sesión', { desde: -10, hasta: 2 }],
        ['inexistente', null],
    ])('C8 · membresía %s: 409', async (_caso, vigencia) => {
        const miembro = await crearMiembro(vigencia);
        const bloqueId = await crearBloque(aFechaLocal(sumarDias(hoy, 5), '10:00'));

        const res = await agendar(miembro.token, bloqueId);

        expect(res.status).toBe(409);
        expect((res.body as { message: string }).message).toBe(MENSAJES.membresia);
        expect((await prisma.bloqueDisponibilidad.findUniqueOrThrow({ where: { id: bloqueId } })).estado).toBe('DISPONIBLE');
    }, 20_000);

    it('C8 · membresía próxima a vencer que cubre la fecha: se agenda', async () => {
        const miembro = await crearMiembro({ desde: -20, hasta: 3 });
        const bloqueId = await crearBloque(aFechaLocal(sumarDias(hoy, 2), '11:00'));
        expect((await agendar(miembro.token, bloqueId)).status).toBe(201);
    }, 20_000);

    it('Precio · cambiarlo después de agendar no cambia la sesión ni el cobro', async () => {
        const miembro = await crearMiembro({ desde: 0, hasta: 29 });
        const bloqueId = await crearBloque(aFechaLocal(sumarDias(hoy, 6), '12:00'));
        const res = await agendar(miembro.token, bloqueId);
        expect(res.status).toBe(201);
        const { id, cobroId } = res.body as { id: string; cobroId: string };

        const cambio = await http()
            .put('/api/v1/configuracion/precio-clase-puntual')
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({ precio: precio + 5 });
        expect(cambio.status).toBe(200);

        expect((await prisma.sesionPersonal.findUniqueOrThrow({ where: { id } })).precio.toNumber()).toBe(precio);
        expect((await prisma.cobro.findUniqueOrThrow({ where: { id: cobroId } })).monto.toNumber()).toBe(precio);
    }, 20_000);

    it('C9 · no hay opción de cancelar: DELETE /sesiones/:id responde 404 y la sesión sigue', async () => {
        const miembro = await crearMiembro({ desde: 0, hasta: 29 });
        const bloqueId = await crearBloque(aFechaLocal(sumarDias(hoy, 7), '13:00'));
        const { id } = (await agendar(miembro.token, bloqueId)).body as { id: string };

        const res = await http().delete(`/api/v1/sesiones/${id}`).set('Authorization', `Bearer ${miembro.token}`);

        expect(res.status).toBe(404);
        expect(await prisma.sesionPersonal.count({ where: { id } })).toBe(1);
    }, 20_000);

    it('Permisos · el entrenador recibe 403 y sin token 401', async () => {
        const bloqueId = await crearBloque(aFechaLocal(sumarDias(hoy, 8), '14:00'));

        expect((await agendar(tokenEntrenador, bloqueId)).status).toBe(403);
        expect((await http().get('/api/v1/entrenadores').set('Authorization', `Bearer ${tokenEntrenador}`)).status).toBe(403);
        expect((await http().post('/api/v1/sesiones').send({ bloqueId })).status).toBe(401);
    }, 20_000);
});