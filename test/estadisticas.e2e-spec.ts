// QA-21.1 · Pruebas del panel de calificaciones (H21)

import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '@Prisma/services';
import { AsistenciaReserva, Rol } from '@PrismaClient';
import { hoyLocal, sumarDias } from '@Common/fechas';

const MARCA_PRUEBA = '[QA-21.1]';
const CORREOS = {
  ADMINISTRADOR: 'admin@madlions.com',
  ENTRENADOR: 'entrenador@madlions.com',
  RECEPCION: 'recepcion@madlions.com',
  MIEMBRO: 'estado.vigente@madlions.com',
} as const;
type RolPrueba = keyof typeof CORREOS;
const NO_ADMINISTRADORES: RolPrueba[] = ['ENTRENADOR', 'RECEPCION', 'MIEMBRO'];
const PASSWORD = 'Demo1234!';

const DIA = 24 * 60 * 60 * 1000;
const INICIO_POSTERIOR = 'La fecha de inicio no puede ser posterior a la de fin';

interface Promedio {
  id: string;
  nombre: string;
  promedio: number | null;
  total: number;
}

interface Calificaciones {
  desde: string;
  hasta: string;
  entrenadores: Promedio[];
  tiposClase: Promedio[];
  instalaciones: { promedio: number | null; total: number };
}

describe('QA-21.1 · Panel de calificaciones (H21)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const token: Record<string, string> = {};
  let miembroId: string;
  let membresiaId: string;
  let tipoClaseId: string;
  let entrenadorAId: string;
  let entrenadorBId: string;
  const usuariosCreados: string[] = [];

  const http = () => request(app.getHttpServer());
  const como = (rol: RolPrueba) => ({ Authorization: `Bearer ${token[rol]}` });

  const panel = (rol: RolPrueba, query: Record<string, string> = {}) =>
    http().get('/api/v1/estadisticas/calificaciones').query(query).set(como(rol));

  const mensaje = (body: { message: string | string[] }) =>
    Array.isArray(body.message) ? body.message[0] : body.message;

  const buscar = (filas: Promedio[], id: string) => filas.find((f) => f.id === id);

  /** `sufijo` es un dígito: el teléfono del usuario son 8 dígitos exactos. */
  async function crearEntrenador(sufijo: string): Promise<string> {
    const passwordHash = (
      await prisma.user.findUniqueOrThrow({ where: { email: CORREOS.ENTRENADOR } })
    ).passwordHash;
    const usuario = await prisma.user.create({
      data: {
        email: `qa21-${sufijo}@test.com`,
        passwordHash,
        nombre: 'Entrenador',
        apellido: `QA21 ${sufijo}`,
        telefono: `7600000${sufijo}`,
        rol: Rol.ENTRENADOR,
      },
    });
    usuariosCreados.push(usuario.id);
    return usuario.id;
  }

  /** Crea clase + reserva con asistencia + reseña, con la fecha que se indique. */
  async function crearResena(
    entrenadorId: string,
    diasAtras: number,
    calificaciones: {
      calActividad?: number | null;
      calEntrenador?: number | null;
      calInstalaciones?: number | null;
    },
  ): Promise<void> {
    const fin = new Date(Date.now() - diasAtras * DIA);
    const clase = await prisma.clase.create({
      data: {
        tipoClaseId,
        entrenadorId,
        descripcion: `${MARCA_PRUEBA} ${diasAtras} días`,
        inicio: new Date(fin.getTime() - 60 * 60 * 1000),
        fin,
        cupoMaximo: 10,
      },
    });
    const reserva = await prisma.reserva.create({
      data: {
        claseId: clase.id,
        miembroId,
        membresiaId,
        asistencia: AsistenciaReserva.ASISTIO,
        asistenciaRegistradaPorId: entrenadorId,
        asistenciaRegistradaEn: fin,
      },
    });
    await prisma.resena.create({
      data: {
        miembroId,
        reservaId: reserva.id,
        entrenadorId,
        tipoClaseId,
        calActividad: calificaciones.calActividad ?? null,
        calEntrenador: calificaciones.calEntrenador ?? null,
        calInstalaciones: calificaciones.calInstalaciones ?? null,
        creadaEn: fin,
      },
    });
  }

  async function limpiar() {
    const clases = await prisma.clase.findMany({
      where: { descripcion: { startsWith: MARCA_PRUEBA } },
      select: { id: true },
    });
    const claseIds = clases.map((c) => c.id);
    const reservas = await prisma.reserva.findMany({
      where: { claseId: { in: claseIds } },
      select: { id: true },
    });

    await prisma.resena.deleteMany({ where: { reservaId: { in: reservas.map((r) => r.id) } } });
    await prisma.reserva.deleteMany({ where: { claseId: { in: claseIds } } });
    await prisma.clase.deleteMany({ where: { id: { in: claseIds } } });
    if (tipoClaseId) await prisma.tipoClase.deleteMany({ where: { id: tipoClaseId } });
    if (usuariosCreados.length) {
      await prisma.user.deleteMany({ where: { id: { in: usuariosCreados } } });
    }
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);

    for (const [rol, email] of Object.entries(CORREOS)) {
      const res = await http().post('/api/v1/auth/login').send({ email, password: PASSWORD });
      if (res.status !== 200 && res.status !== 201) {
        throw new Error(`No se pudo iniciar sesión con ${email}: corre npm run db:seed`);
      }
      token[rol] = (res.body as { accessToken: string }).accessToken;
    }

    // El promedio de las instalaciones es global: si quedaran reseñas de otra
    // prueba, el resultado esperado no cuadraría.
    if (await prisma.resena.count()) {
      throw new Error('Hay reseñas de otra corrida en la base: el panel es global');
    }

    const usuario = await prisma.user.findUniqueOrThrow({
      where: { email: CORREOS.MIEMBRO },
      select: { miembro: { select: { id: true, membresias: { select: { id: true } } } } },
    });
    if (!usuario.miembro?.membresias.length) {
      throw new Error(`${CORREOS.MIEMBRO} necesita ficha y membresía: corre npm run db:seed`);
    }
    miembroId = usuario.miembro.id;
    membresiaId = usuario.miembro.membresias[0].id;

    const tipo = await prisma.tipoClase.create({
      data: { nombre: `${MARCA_PRUEBA} Tipo`, descripcion: 'Tipo de clase de la prueba QA-21.1' },
    });
    tipoClaseId = tipo.id;

    entrenadorAId = await crearEntrenador('1');
    entrenadorBId = await crearEntrenador('2');

    // Entrenador A: 3 calificaciones (5, 4, 3) → promedio 4.0.
    await crearResena(entrenadorAId, 1, { calEntrenador: 5, calActividad: 5, calInstalaciones: 5 });
    await crearResena(entrenadorAId, 2, { calEntrenador: 4, calActividad: 4, calInstalaciones: 4 });
    await crearResena(entrenadorAId, 3, { calEntrenador: 3, calActividad: 3, calInstalaciones: 3 });
    // Omite al entrenador y las instalaciones: no pesan en esos dos aspectos.
    await crearResena(entrenadorAId, 4, { calActividad: 1 });
    // Fuera del rango por defecto: no cuenta en ningún aspecto.
    await crearResena(entrenadorAId, 60, {
      calEntrenador: 1,
      calActividad: 1,
      calInstalaciones: 1,
    });

    // Entrenador B: solo 2 calificaciones → sin datos suficientes.
    await crearResena(entrenadorBId, 1, { calEntrenador: 5 });
    await crearResena(entrenadorBId, 2, { calEntrenador: 5 });
  });

  afterAll(async () => {
    await limpiar();
    await app.close();
  });

  describe('Criterio 1 · Promedio con un decimal y total por entrenador, clase e instalaciones', () => {
    it('QA-01 · el entrenador con 3 calificaciones trae su promedio', async () => {
      const res = await panel('ADMINISTRADOR');

      expect(res.status).toBe(200);
      const cuerpo = res.body as Calificaciones;
      expect(buscar(cuerpo.entrenadores, entrenadorAId)).toMatchObject({
        promedio: 4,
        total: 3,
      });
    });

    it('QA-02 · las calificaciones omitidas no cuentan en ese aspecto', async () => {
      const cuerpo = (await panel('ADMINISTRADOR')).body as Calificaciones;

      // La cuarta reseña omitió al entrenador: sigue en 3 y el promedio no baja.
      expect(buscar(cuerpo.entrenadores, entrenadorAId)!.total).toBe(3);
      // Pero sí calificó la actividad: el tipo de clase cuenta 4.
      expect(buscar(cuerpo.tiposClase, tipoClaseId)).toMatchObject({
        promedio: 3.3,
        total: 4,
      });
    });

    it('QA-03 · el tipo de clase redondea a un decimal', async () => {
      const cuerpo = (await panel('ADMINISTRADOR')).body as Calificaciones;

      // (5 + 4 + 3 + 1) / 4 = 3.25 → 3.3
      expect(buscar(cuerpo.tiposClase, tipoClaseId)!.promedio).toBe(3.3);
    });

    it('QA-04 · las instalaciones traen su promedio y su total', async () => {
      const cuerpo = (await panel('ADMINISTRADOR')).body as Calificaciones;

      expect(cuerpo.instalaciones).toEqual({ promedio: 4, total: 3 });
    });

    it('QA-05 · los entrenadores del seed aparecen aunque no tengan reseñas', async () => {
      const cuerpo = (await panel('ADMINISTRADOR')).body as Calificaciones;
      const delSeed = await prisma.user.findUniqueOrThrow({
        where: { email: CORREOS.ENTRENADOR },
        select: { id: true },
      });

      expect(buscar(cuerpo.entrenadores, delSeed.id)).toMatchObject({
        promedio: null,
        total: 0,
      });
    });
  });

  describe('Criterio 2 · Rango de 30 días por defecto y rango elegido', () => {
    it('QA-06 · sin rango devuelve los últimos 30 días', async () => {
      const cuerpo = (await panel('ADMINISTRADOR')).body as Calificaciones;

      expect(cuerpo.hasta).toBe(hoyLocal());
      expect(cuerpo.desde).toBe(sumarDias(hoyLocal(), -29));
    });

    it('QA-07 · la reseña de hace 60 días no entra en el rango por defecto', async () => {
      const cuerpo = (await panel('ADMINISTRADOR')).body as Calificaciones;

      // Con ella serían 4 calificaciones al entrenador A y el promedio bajaría.
      expect(buscar(cuerpo.entrenadores, entrenadorAId)!.total).toBe(3);
    });

    it('QA-08 · al ampliar el rango sí entra y el promedio cambia', async () => {
      const cuerpo = (
        await panel('ADMINISTRADOR', {
          desde: sumarDias(hoyLocal(), -90),
          hasta: hoyLocal(),
        })
      ).body as Calificaciones;

      // (5 + 4 + 3 + 1) / 4 = 3.25 → 3.3
      expect(buscar(cuerpo.entrenadores, entrenadorAId)).toMatchObject({
        promedio: 3.3,
        total: 4,
      });
    });

    it('QA-09 · un rango sin reseñas deja todo sin datos', async () => {
      const cuerpo = (
        await panel('ADMINISTRADOR', {
          desde: sumarDias(hoyLocal(), -400),
          hasta: sumarDias(hoyLocal(), -300),
        })
      ).body as Calificaciones;

      expect(buscar(cuerpo.entrenadores, entrenadorAId)).toMatchObject({
        promedio: null,
        total: 0,
      });
      expect(cuerpo.instalaciones).toEqual({ promedio: null, total: 0 });
    });

    it('QA-10 · el rango devuelto es el que se pidió', async () => {
      const cuerpo = (
        await panel('ADMINISTRADOR', { desde: '2026-11-01', hasta: '2026-11-15' })
      ).body as Calificaciones;

      expect(cuerpo).toMatchObject({ desde: '2026-11-01', hasta: '2026-11-15' });
    });
  });

  describe('Criterio 3 · Con menos de 3 reseñas no se publica el promedio', () => {
    it('QA-11 · el entrenador con 2 calificaciones llega sin promedio', async () => {
      const cuerpo = (await panel('ADMINISTRADOR')).body as Calificaciones;

      expect(buscar(cuerpo.entrenadores, entrenadorBId)).toMatchObject({
        promedio: null,
        total: 2,
      });
    });

    it('QA-12 · con la tercera ya se publica', async () => {
      await crearResena(entrenadorBId, 3, { calEntrenador: 5 });

      const cuerpo = (await panel('ADMINISTRADOR')).body as Calificaciones;

      expect(buscar(cuerpo.entrenadores, entrenadorBId)).toMatchObject({
        promedio: 5,
        total: 3,
      });
    });
  });

  describe('Criterio 4 · Rango inválido', () => {
    it('QA-13 · 400 si el inicio es posterior al fin', async () => {
      const res = await panel('ADMINISTRADOR', { desde: '2026-11-30', hasta: '2026-11-01' });

      expect(res.status).toBe(400);
      expect(mensaje(res.body as { message: string })).toBe(INICIO_POSTERIOR);
    });

    it('QA-14 · 400 con un formato que no es AAAA-MM-DD', async () => {
      expect((await panel('ADMINISTRADOR', { desde: '01/11/2026' })).status).toBe(400);
    });

    it('QA-15 · 400 con una fecha que no existe', async () => {
      expect((await panel('ADMINISTRADOR', { desde: '2026-02-30' })).status).toBe(400);
    });

    it('QA-16 · el mismo día de inicio y fin sí se acepta', async () => {
      const res = await panel('ADMINISTRADOR', { desde: hoyLocal(), hasta: hoyLocal() });

      expect(res.status).toBe(200);
    });
  });

  describe('Criterio 5 · Solo el administrador entra al panel', () => {
    it('QA-17 · miembro, entrenador y recepción reciben 403', async () => {
      for (const rol of NO_ADMINISTRADORES) {
        expect((await panel(rol)).status, `como ${rol}`).toBe(403);
      }
    });

    it('QA-18 · sin sesión da 401', async () => {
      expect((await http().get('/api/v1/estadisticas/calificaciones')).status).toBe(401);
    });
  });
});
