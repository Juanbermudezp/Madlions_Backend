/**
 * QA-29.1 (parte backend) · Reporte de desempeño de entrenadores (H29)
 *
 * Contra la base real del docker-compose, con datos de resultado conocido en
 * un rango al azar del pasado (entre 2001 y 2015), para que no se mezclen con
 * los datos de tu base local. Todo lo que crea (usuarios qa29-, tipo de clase,
 * plan, clases, reservas, bloques, sesiones y reseñas) se borra al terminar.
 *
 * Entrenador A (resultado esperado, calculado a mano):
 * - Clases: 2 impartidas (cupo 10 + 10; 2 + 3 reservas confirmadas) → 25.0 %.
 *   Una clase cancelada por el gimnasio y una reserva cancelada por el miembro
 *   no cuentan.
 * - Sesiones: 3 con "Asistió" y 1 con "No asistió" → 3 realizadas.
 * - Reseñas: 5, 4 y 4 → 4.3 (3 reseñas).
 * Entrenador B: sin clases (ocupación null), 2 sesiones realizadas y 2 reseñas
 * (5 y 5) → "Sin datos suficientes" (null).
 *
 * Requisitos: migraciones aplicadas y `npm run db:seed`.
 * Ejecutar: npm run test:e2e
 */
import { randomInt, randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { aFechaLocal, sumarDias } from '@Common/fechas';
import { PrismaService } from '@Prisma/services';
import {
    AsistenciaSesion,
    EstadoBloque,
    EstadoClase,
    EstadoMembresia,
    EstadoReserva,
    Rol,
    TipoOperacionMembresia,
    TipoPlan,
} from '@PrismaClient';

const CLAVE = 'Demo1234!';

interface Fila {
    entrenador: { id: string; nombre: string };
    clasesImpartidas: number;
    ocupacionPromedio: number | null;
    sesionesRealizadas: number;
    calificacion: number | null;
    resenas: number;
}
interface Reporte {
    desde: string;
    hasta: string;
    filas: Fila[];
}

describe('QA-29.1 · Reporte de desempeño de entrenadores (H29)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    const corrida = randomUUID().slice(0, 6);
    let siguiente = randomInt(100_000, 899_000);
    /** 30 días al azar entre 2001 y 2015. */
    const desde = sumarDias('2001-01-01', randomInt(0, 5_000));
    const hasta = sumarDias(desde, 29);
    const rango = `desde=${desde}&hasta=${hasta}`;
    const hora = (dia: number, hhmm: string) => aFechaLocal(sumarDias(desde, dia), hhmm);

    const usuarios: string[] = [];
    const miembros: string[] = [];
    const clases: string[] = [];
    const bloques: string[] = [];
    let planId: string;
    let tipoClaseId: string;
    let passwordHash: string;
    let recepcionId: string;
    let A: { id: string; email: string };
    let B: { id: string; email: string };
    const tokens = {} as Record<'admin' | 'B' | 'miembro' | 'recepcion', string>;

    const http = () => request(app.getHttpServer());
    const get = (ruta: string, token: string) =>
        http().get(`/api/v1/reportes/desempeno${ruta}`).set('Authorization', `Bearer ${token}`);

    async function login(email: string): Promise<string> {
        const res = await http().post('/api/v1/auth/login').send({ email, password: CLAVE });
        if (res.status !== 200) throw new Error(`No se pudo iniciar sesión con ${email}: corre npm run db:seed`);
        return (res.body as { accessToken: string }).accessToken;
    }

    async function crearUsuario(rol: Rol, nombre: string) {
        const n = siguiente++;
        const email = `qa29-${corrida}-${n}@test.com`;
        const usuario = await prisma.user.create({
            data: { email, passwordHash, nombre, apellido: `QA29 ${corrida}`, rol, telefono: String(77_000_000 + n).slice(0, 8) },
        });
        usuarios.push(usuario.id);
        return { id: usuario.id, email, n };
    }

    async function crearMiembro() {
        const usuario = await crearUsuario(Rol.MIEMBRO, 'Prueba');
        const miembro = await prisma.miembro.create({
            data: {
                usuarioId: usuario.id,
                documento: `${String(usuario.n).padStart(8, '0')}-${usuario.n % 10}`,
                codigoMiembro: `MBR-${String(usuario.n).padStart(6, '0')}`,
            },
        });
        miembros.push(miembro.id);
        const membresia = await prisma.membresia.create({
            data: {
                miembroId: miembro.id, planId, nombrePlan: `[QA-29.1] Mensual ${corrida}`, tipoPlan: TipoPlan.MENSUAL,
                precio: 30, tipoOperacion: TipoOperacionMembresia.COMPRA, estado: EstadoMembresia.PAGADA,
                fechaInicioSolicitada: new Date(`${desde}T00:00:00Z`), fechaInicio: new Date(`${desde}T00:00:00Z`),
                fechaVencimiento: new Date(`${hasta}T00:00:00Z`), registradaPorId: recepcionId,
            },
        });
        return { miembroId: miembro.id, membresiaId: membresia.id };
    }

    async function crearClase(entrenadorId: string, dia: number, reservas: { m: { miembroId: string; membresiaId: string }; estado?: EstadoReserva }[], estado: EstadoClase = EstadoClase.PROGRAMADA) {
        const clase = await prisma.clase.create({
            data: { tipoClaseId, entrenadorId, inicio: hora(dia, '18:00'), fin: hora(dia, '19:00'), cupoMaximo: 10, estado },
        });
        clases.push(clase.id);
        for (const { m, estado: e = EstadoReserva.CONFIRMADA } of reservas) {
            await prisma.reserva.create({
                data: {
                    claseId: clase.id, miembroId: m.miembroId, membresiaId: m.membresiaId, estado: e,
                    canceladaEn: e === EstadoReserva.CONFIRMADA ? null : hora(dia, '10:00'),
                },
            });
        }
    }

    /** Sesión personal pasada con su asistencia y, si se indica, la reseña del entrenador. */
    async function crearSesion(entrenadorId: string, miembroId: string, dia: number, asistencia: AsistenciaSesion, calEntrenador?: number) {
        const inicio = hora(dia, '08:00');
        const fin = hora(dia, '09:00');
        const bloque = await prisma.bloqueDisponibilidad.create({
            data: { entrenadorId, inicio, fin, duracionMin: 60, estado: EstadoBloque.OCUPADO },
        });
        bloques.push(bloque.id);
        const registrada = asistencia !== AsistenciaSesion.SIN_REGISTRAR;
        const sesion = await prisma.sesionPersonal.create({
            data: {
                bloqueId: bloque.id, miembroId, entrenadorId, inicio, fin, precio: 15, asistencia,
                asistenciaRegistradaPorId: registrada ? entrenadorId : null,
                asistenciaRegistradaEn: registrada ? fin : null,
            },
        });
        if (calEntrenador) {
            await prisma.resena.create({
                data: { miembroId, sesionId: sesion.id, entrenadorId, calEntrenador, creadaEn: hora(dia, '12:00') },
            });
        }
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

        planId = (await prisma.plan.create({
            data: { nombre: `[QA-29.1] Mensual ${corrida}`, tipo: TipoPlan.MENSUAL, precio: 30, duracionDias: 30, beneficios: 'Prueba H29' },
        })).id;
        tipoClaseId = (await prisma.tipoClase.create({ data: { nombre: `[QA-29.1] Yoga ${corrida}`, descripcion: 'Prueba H29' } })).id;

        A = await crearUsuario(Rol.ENTRENADOR, 'Alfa');
        B = await crearUsuario(Rol.ENTRENADOR, 'Beta');
        const [m1, m2, m3] = [await crearMiembro(), await crearMiembro(), await crearMiembro()];

        // A: 2 clases impartidas (2 + 3 confirmadas de 20 lugares), 1 cancelada por el gimnasio.
        await crearClase(A.id, 1, [{ m: m1 }, { m: m2 }, { m: m3, estado: EstadoReserva.CANCELADA_MIEMBRO }]);
        await crearClase(A.id, 2, [{ m: m1 }, { m: m2 }, { m: m3 }]);
        await crearClase(A.id, 3, [{ m: m1, estado: EstadoReserva.CANCELADA_GIMNASIO }], EstadoClase.CANCELADA_GIMNASIO);

        // A: 3 sesiones "Asistió" con reseñas 5, 4 y 4; 1 "No asistió".
        await crearSesion(A.id, m1.miembroId, 4, AsistenciaSesion.ASISTIO, 5);
        await crearSesion(A.id, m2.miembroId, 5, AsistenciaSesion.ASISTIO, 4);
        await crearSesion(A.id, m3.miembroId, 6, AsistenciaSesion.ASISTIO, 4);
        await crearSesion(A.id, m1.miembroId, 7, AsistenciaSesion.NO_ASISTIO);

        // B: 2 sesiones "Asistió" con reseñas 5 y 5.
        await crearSesion(B.id, m1.miembroId, 8, AsistenciaSesion.ASISTIO, 5);
        await crearSesion(B.id, m2.miembroId, 9, AsistenciaSesion.ASISTIO, 5);

        tokens.admin = await login('admin@madlions.com');
        tokens.miembro = await login('miembro@madlions.com');
        tokens.recepcion = await login('recepcion@madlions.com');
        tokens.B = await login(B.email);
    }, 60_000);

    afterAll(async () => {
        await prisma.resena.deleteMany({ where: { entrenadorId: { in: usuarios } } });
        await prisma.sesionPersonal.deleteMany({ where: { entrenadorId: { in: usuarios } } });
        await prisma.bloqueDisponibilidad.deleteMany({ where: { id: { in: bloques } } });
        await prisma.reserva.deleteMany({ where: { claseId: { in: clases } } });
        await prisma.clase.deleteMany({ where: { id: { in: clases } } });
        await prisma.tipoClase.deleteMany({ where: { id: tipoClaseId } });
        await prisma.membresia.deleteMany({ where: { miembroId: { in: miembros } } });
        await prisma.plan.deleteMany({ where: { id: planId } });
        await prisma.miembro.deleteMany({ where: { id: { in: miembros } } });
        await prisma.user.deleteMany({ where: { id: { in: usuarios } } });
        await app.close();
    });

    const filaDe = (reporte: Reporte, id: string) => reporte.filas.find((f) => f.entrenador.id === id);

    it('QA-D01 · el administrador ve por entrenador clases, ocupación, sesiones y calificación', async () => {
        const res = await get(`?${rango}`, tokens.admin).expect(200);
        const reporte = res.body as Reporte;

        expect(reporte).toMatchObject({ desde, hasta });
        expect(filaDe(reporte, A.id)).toEqual({
            entrenador: { id: A.id, nombre: `Alfa QA29 ${corrida}` },
            clasesImpartidas: 2,
            ocupacionPromedio: 25,
            sesionesRealizadas: 3,
            calificacion: 4.3,
            resenas: 3,
        });
    });

    it('QA-D02 · no cuentan la clase cancelada, la reserva cancelada ni la sesión "No asistió"', async () => {
        const reporte = (await get(`?${rango}`, tokens.admin).expect(200)).body as Reporte;

        expect(filaDe(reporte, A.id)).toMatchObject({ clasesImpartidas: 2, ocupacionPromedio: 25, sesionesRealizadas: 3 });
    });

    it('QA-D03 · con menos de 3 reseñas la calificación es null ("Sin datos suficientes")', async () => {
        const reporte = (await get(`?${rango}`, tokens.admin).expect(200)).body as Reporte;

        expect(filaDe(reporte, B.id)).toMatchObject({
            clasesImpartidas: 0,
            ocupacionPromedio: null,
            sesionesRealizadas: 2,
            calificacion: null,
            resenas: 2,
        });
    });

    it('QA-D04 · fuera del rango no aparecen las métricas', async () => {
        const otro = `desde=${sumarDias(hasta, 1)}&hasta=${sumarDias(hasta, 30)}`;
        const reporte = (await get(`?${otro}`, tokens.admin).expect(200)).body as Reporte;

        expect(filaDe(reporte, A.id)).toMatchObject({ clasesImpartidas: 0, sesionesRealizadas: 0, resenas: 0 });
    });

    it('QA-D05 · el administrador puede filtrar por entrenador', async () => {
        const reporte = (await get(`?${rango}&entrenadorId=${A.id}`, tokens.admin).expect(200)).body as Reporte;

        expect(reporte.filas.map((f) => f.entrenador.id)).toEqual([A.id]);
    });

    it('QA-D06 · rango inválido o de más de 12 meses responde 400', async () => {
        await get(`?desde=${hasta}&hasta=${desde}`, tokens.admin).expect(400);
        await get(`?desde=${desde}&hasta=${sumarDias(desde, 400)}`, tokens.admin).expect(400);
        await get('?entrenadorId=no-es-uuid', tokens.admin).expect(400);
    });

    it('QA-D07 · un entrenador solo ve sus métricas aunque pida las de otro', async () => {
        const reporte = (await get(`?${rango}&entrenadorId=${A.id}`, tokens.B).expect(200)).body as Reporte;

        expect(reporte.filas).toHaveLength(1);
        expect(reporte.filas[0]).toMatchObject({ entrenador: { id: B.id }, sesionesRealizadas: 2 });
    });

    it('QA-D08 · miembro y recepción reciben 403; sin sesión, 401', async () => {
        await get('', tokens.miembro).expect(403);
        await get('', tokens.recepcion).expect(403);
        await http().get('/api/v1/reportes/desempeno').expect(401);
    });
});
