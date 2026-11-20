// QA-20.1 · Pruebas de la calificación de una clase o sesión (H20)

import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '@Prisma/services';
import { AsistenciaReserva, AsistenciaSesion } from '@PrismaClient';

const MARCA_PRUEBA = '[QA-20.1]';
const CORREOS = {
  MIEMBRO: 'estado.vigente@madlions.com',
  OTRO_MIEMBRO: 'estado.proxima@madlions.com',
  ENTRENADOR: 'entrenador@madlions.com',
  RECEPCION: 'recepcion@madlions.com',
  ADMINISTRADOR: 'admin@madlions.com',
} as const;
type RolPrueba = keyof typeof CORREOS;
const NO_MIEMBROS: RolPrueba[] = ['ENTRENADOR', 'RECEPCION', 'ADMINISTRADOR'];
const PASSWORD = 'Demo1234!';

const DIA = 24 * 60 * 60 * 1000;
const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';
const CALIFICA_AL_MENOS_UN_ASPECTO = 'Califica al menos un aspecto.';

interface Pendiente {
  tipo: 'CLASE' | 'SESION';
  registroId: string;
  nombre: string;
  entrenador: string;
  fin: string;
  fechaLimite: string;
}

describe('QA-20.1 · Calificación de una clase o sesión (H20)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const token: Record<string, string> = {};
  let entrenadorId: string;
  let miembroId: string;
  let otroMiembroId: string;
  let membresiaId: string;
  let otraMembresiaId: string;
  let tipoClaseId: string;

  const ids = {
    reservaReciente: '',
    reservaVieja: '',
    reservaSinAsistencia: '',
    reservaDeOtro: '',
    reservaParaCalificar: '',
    reservaNoAsistio: '',
    sesion: '',
  };

  const http = () => request(app.getHttpServer());
  const como = (rol: RolPrueba) => ({ Authorization: `Bearer ${token[rol]}` });

  const pendientes = (rol: RolPrueba) =>
    http().get('/api/v1/resenas/pendientes').set(como(rol));

  const calificar = (rol: RolPrueba, cuerpo: Record<string, unknown>) =>
    http().post('/api/v1/resenas').set(como(rol)).send(cuerpo);

  const mensaje = (body: { message: string | string[] }) =>
    Array.isArray(body.message) ? body.message[0] : body.message;

  const buscar = (cuerpo: Pendiente[], registroId: string) =>
    cuerpo.find((p) => p.registroId === registroId);

  async function crearClase(nombre: string, finHaceMs: number): Promise<string> {
    const fin = new Date(Date.now() - finHaceMs);
    const clase = await prisma.clase.create({
      data: {
        tipoClaseId,
        entrenadorId,
        descripcion: `${MARCA_PRUEBA} ${nombre}`,
        inicio: new Date(fin.getTime() - 60 * 60 * 1000),
        fin,
        cupoMaximo: 10,
      },
    });
    return clase.id;
  }

  /**
   * La asistencia va con quién y cuándo la registró: el CHECK de H19 exige
   * los tres campos juntos.
   */
  function marcaDe(asistencia: AsistenciaReserva) {
    return asistencia === AsistenciaReserva.SIN_REGISTRAR
      ? {}
      : {
          asistencia,
          asistenciaRegistradaPorId: entrenadorId,
          asistenciaRegistradaEn: new Date(),
        };
  }

  async function crearReserva(
    claseId: string,
    asistencia: AsistenciaReserva,
    deOtroMiembro = false,
  ): Promise<string> {
    const reserva = await prisma.reserva.create({
      data: {
        claseId,
        miembroId: deOtroMiembro ? otroMiembroId : miembroId,
        membresiaId: deOtroMiembro ? otraMembresiaId : membresiaId,
        ...marcaDe(asistencia),
      },
    });
    return reserva.id;
  }

  async function crearSesion(finHaceMs: number): Promise<string> {
    const fin = new Date(Date.now() - finHaceMs);
    const inicio = new Date(fin.getTime() - 60 * 60 * 1000);
    const bloque = await prisma.bloqueDisponibilidad.create({
      data: { entrenadorId, inicio, fin, duracionMin: 60, estado: 'OCUPADO' },
    });
    const sesion = await prisma.sesionPersonal.create({
      data: {
        bloqueId: bloque.id,
        miembroId,
        entrenadorId,
        inicio,
        fin,
        precio: 10,
        asistencia: AsistenciaSesion.ASISTIO,
        asistenciaRegistradaPorId: entrenadorId,
        asistenciaRegistradaEn: new Date(),
      },
    });
    return sesion.id;
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
    const sesiones = await prisma.sesionPersonal.findMany({
      where: { entrenadorId, bloque: { estado: 'OCUPADO' } },
      select: { id: true, bloqueId: true },
    });

    await prisma.resena.deleteMany({
      where: {
        OR: [
          { reservaId: { in: reservas.map((r) => r.id) } },
          { sesionId: { in: sesiones.map((s) => s.id) } },
        ],
      },
    });
    await prisma.reserva.deleteMany({ where: { claseId: { in: claseIds } } });
    await prisma.sesionPersonal.deleteMany({ where: { id: { in: sesiones.map((s) => s.id) } } });
    await prisma.bloqueDisponibilidad.deleteMany({
      where: { id: { in: sesiones.map((s) => s.bloqueId) } },
    });
    await prisma.clase.deleteMany({ where: { id: { in: claseIds } } });
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

    entrenadorId = (
      await prisma.user.findUniqueOrThrow({
        where: { email: CORREOS.ENTRENADOR },
        select: { id: true },
      })
    ).id;

    const fichaDe = async (email: string) => {
      const usuario = await prisma.user.findUniqueOrThrow({
        where: { email },
        select: { miembro: { select: { id: true, membresias: { select: { id: true } } } } },
      });
      if (!usuario.miembro?.membresias.length) {
        throw new Error(`${email} necesita ficha de miembro y membresía: corre npm run db:seed`);
      }
      return { miembroId: usuario.miembro.id, membresiaId: usuario.miembro.membresias[0].id };
    };

    ({ miembroId, membresiaId } = await fichaDe(CORREOS.MIEMBRO));
    ({ miembroId: otroMiembroId, membresiaId: otraMembresiaId } = await fichaDe(
      CORREOS.OTRO_MIEMBRO,
    ));

    tipoClaseId = (await prisma.tipoClase.findFirstOrThrow({ select: { id: true } })).id;

    await limpiar();

    ids.reservaReciente = await crearReserva(
      await crearClase('reciente', 1 * DIA),
      AsistenciaReserva.ASISTIO,
    );
    ids.reservaVieja = await crearReserva(
      await crearClase('vieja', 8 * DIA),
      AsistenciaReserva.ASISTIO,
    );
    ids.reservaSinAsistencia = await crearReserva(
      await crearClase('sin asistencia', 1 * DIA),
      AsistenciaReserva.SIN_REGISTRAR,
    );
    ids.reservaNoAsistio = await crearReserva(
      await crearClase('no asistio', 1 * DIA),
      AsistenciaReserva.NO_ASISTIO,
    );
    ids.reservaDeOtro = await crearReserva(
      await crearClase('de otro miembro', 1 * DIA),
      AsistenciaReserva.ASISTIO,
      true,
    );
    ids.reservaParaCalificar = await crearReserva(
      await crearClase('para calificar', 2 * DIA),
      AsistenciaReserva.ASISTIO,
    );
    ids.sesion = await crearSesion(2 * DIA);
  });

  afterAll(async () => {
    await limpiar();
    await app.close();
  });

  describe('Criterio 1 · El miembro ve lo de los últimos 7 días con asistencia y sin calificar', () => {
    it('QA-01 · la clase reciente con asistencia aparece, con su fecha límite', async () => {
      const res = await pendientes('MIEMBRO');

      expect(res.status).toBe(200);
      const pendiente = buscar(res.body as Pendiente[], ids.reservaReciente);
      expect(pendiente).toBeDefined();
      expect(pendiente!.tipo).toBe('CLASE');
      expect(pendiente!.entrenador).toBeTruthy();
      expect(new Date(pendiente!.fechaLimite).getTime()).toBe(
        new Date(pendiente!.fin).getTime() + 7 * DIA,
      );
    });

    it('QA-02 · la sesión personal también aparece', async () => {
      const cuerpo = (await pendientes('MIEMBRO')).body as Pendiente[];
      const pendiente = buscar(cuerpo, ids.sesion);

      expect(pendiente).toBeDefined();
      expect(pendiente!.tipo).toBe('SESION');
    });

    it('QA-03 · la de hace más de 7 días no aparece', async () => {
      const cuerpo = (await pendientes('MIEMBRO')).body as Pendiente[];

      expect(buscar(cuerpo, ids.reservaVieja)).toBeUndefined();
    });

    it('QA-04 · la que no tiene asistencia registrada no aparece', async () => {
      const cuerpo = (await pendientes('MIEMBRO')).body as Pendiente[];

      expect(buscar(cuerpo, ids.reservaSinAsistencia)).toBeUndefined();
    });

    it('QA-05 · la marcada "No asistió" tampoco (supuesto S12)', async () => {
      const cuerpo = (await pendientes('MIEMBRO')).body as Pendiente[];

      expect(buscar(cuerpo, ids.reservaNoAsistio)).toBeUndefined();
    });

    it('QA-06 · la de otro miembro no aparece en mi lista', async () => {
      const cuerpo = (await pendientes('MIEMBRO')).body as Pendiente[];

      expect(buscar(cuerpo, ids.reservaDeOtro)).toBeUndefined();
      expect(buscar((await pendientes('OTRO_MIEMBRO')).body as Pendiente[], ids.reservaDeOtro))
        .toBeDefined();
    });
  });

  describe('Criterio 2 · Tres calificaciones por separado, opcionales, con comentario', () => {
    it('QA-07 · con las tres y comentario', async () => {
      const res = await calificar('MIEMBRO', {
        tipo: 'CLASE',
        registroId: ids.reservaParaCalificar,
        calActividad: 5,
        calEntrenador: 4,
        calInstalaciones: 3,
        comentario: 'La clase estuvo muy buena.',
      });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        tipo: 'CLASE',
        registroId: ids.reservaParaCalificar,
        calActividad: 5,
        calEntrenador: 4,
        calInstalaciones: 3,
        comentario: 'La clase estuvo muy buena.',
      });
    });

    it('QA-08 · el entrenador y el tipo de clase se copian del registro', async () => {
      const resena = await prisma.resena.findUniqueOrThrow({
        where: { reservaId: ids.reservaParaCalificar },
      });

      expect(resena.entrenadorId).toBe(entrenadorId);
      expect(resena.tipoClaseId).toBe(tipoClaseId);
      expect(resena.miembroId).toBe(miembroId);
    });

    it('QA-09 · con una sola calificación y sin comentario', async () => {
      const res = await calificar('MIEMBRO', {
        tipo: 'SESION',
        registroId: ids.sesion,
        calEntrenador: 5,
      });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        calActividad: null,
        calEntrenador: 5,
        calInstalaciones: null,
        comentario: null,
      });
    });

    it('QA-10 · la reseña de una sesión va sin tipo de clase', async () => {
      const resena = await prisma.resena.findUniqueOrThrow({ where: { sesionId: ids.sesion } });

      expect(resena.tipoClaseId).toBeNull();
      expect(resena.entrenadorId).toBe(entrenadorId);
    });

    it('QA-11 · 400 con una calificación fuera de 1 a 5', async () => {
      for (const valor of [0, 6, 2.5]) {
        const res = await calificar('MIEMBRO', {
          tipo: 'CLASE',
          registroId: ids.reservaReciente,
          calActividad: valor,
        });
        expect(res.status, `valor ${valor}`).toBe(400);
      }
    });

    it('QA-12 · 400 con un comentario de más de 500 caracteres', async () => {
      const res = await calificar('MIEMBRO', {
        tipo: 'CLASE',
        registroId: ids.reservaReciente,
        calActividad: 5,
        comentario: 'a'.repeat(501),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('Criterio 3 · Al guardar la reseña, la actividad sale de pendientes', () => {
    it('QA-13 · la clase calificada ya no aparece', async () => {
      const cuerpo = (await pendientes('MIEMBRO')).body as Pendiente[];

      expect(buscar(cuerpo, ids.reservaParaCalificar)).toBeUndefined();
    });

    it('QA-14 · la sesión calificada tampoco', async () => {
      const cuerpo = (await pendientes('MIEMBRO')).body as Pendiente[];

      expect(buscar(cuerpo, ids.sesion)).toBeUndefined();
    });

    it('QA-15 · la que no califiqué sigue ahí', async () => {
      const cuerpo = (await pendientes('MIEMBRO')).body as Pendiente[];

      expect(buscar(cuerpo, ids.reservaReciente)).toBeDefined();
    });
  });

  describe('Criterio 4 · Sin ninguna calificación se rechaza', () => {
    it('QA-16 · 400 "Califica al menos un aspecto"', async () => {
      const res = await calificar('MIEMBRO', {
        tipo: 'CLASE',
        registroId: ids.reservaReciente,
      });

      expect(res.status).toBe(400);
      expect(mensaje(res.body as { message: string })).toBe(CALIFICA_AL_MENOS_UN_ASPECTO);
    });

    it('QA-17 · 400 aunque mande solo comentario', async () => {
      const res = await calificar('MIEMBRO', {
        tipo: 'CLASE',
        registroId: ids.reservaReciente,
        comentario: 'Solo quiero comentar.',
      });

      expect(res.status).toBe(400);
      expect(mensaje(res.body as { message: string })).toBe(CALIFICA_AL_MENOS_UN_ASPECTO);
    });

    it('QA-18 · el rechazo no deja reseña', async () => {
      const resena = await prisma.resena.findUnique({
        where: { reservaId: ids.reservaReciente },
      });

      expect(resena).toBeNull();
    });
  });

  describe('Criterio 5 · Sin asistencia, fuera de plazo o ya calificada se rechaza', () => {
    it('QA-19 · 409 sin asistencia registrada', async () => {
      const res = await calificar('MIEMBRO', {
        tipo: 'CLASE',
        registroId: ids.reservaSinAsistencia,
        calActividad: 5,
      });

      expect(res.status).toBe(409);
    });

    it('QA-20 · 409 si quedó "No asistió"', async () => {
      const res = await calificar('MIEMBRO', {
        tipo: 'CLASE',
        registroId: ids.reservaNoAsistio,
        calActividad: 5,
      });

      expect(res.status).toBe(409);
    });

    it('QA-21 · 409 pasados los 7 días', async () => {
      const res = await calificar('MIEMBRO', {
        tipo: 'CLASE',
        registroId: ids.reservaVieja,
        calActividad: 5,
      });

      expect(res.status).toBe(409);
    });

    it('QA-22 · 409 al calificar dos veces', async () => {
      const res = await calificar('MIEMBRO', {
        tipo: 'CLASE',
        registroId: ids.reservaParaCalificar,
        calActividad: 3,
      });

      expect(res.status).toBe(409);
    });

    it('QA-23 · la reseña original no cambió', async () => {
      const resena = await prisma.resena.findUniqueOrThrow({
        where: { reservaId: ids.reservaParaCalificar },
      });

      expect(resena.calActividad).toBe(5);
    });

    it('QA-24 · 404 si el registro no existe', async () => {
      const res = await calificar('MIEMBRO', {
        tipo: 'CLASE',
        registroId: UUID_INEXISTENTE,
        calActividad: 5,
      });

      expect(res.status).toBe(404);
    });

    it('QA-25 · 403 al calificar la clase de otro miembro', async () => {
      const res = await calificar('MIEMBRO', {
        tipo: 'CLASE',
        registroId: ids.reservaDeOtro,
        calActividad: 5,
      });

      expect(res.status).toBe(403);
    });
  });

  describe('Criterio 6 · Entrenador, recepción y administrador no califican', () => {
    it('QA-26 · los tres roles reciben 403 en los dos endpoints', async () => {
      for (const rol of NO_MIEMBROS) {
        expect((await pendientes(rol)).status, `pendientes como ${rol}`).toBe(403);
        expect(
          (
            await calificar(rol, {
              tipo: 'CLASE',
              registroId: ids.reservaReciente,
              calActividad: 5,
            })
          ).status,
          `calificar como ${rol}`,
        ).toBe(403);
      }
    });

    it('QA-27 · sin sesión no se puede ni listar ni calificar', async () => {
      expect((await http().get('/api/v1/resenas/pendientes')).status).toBe(401);
      expect(
        (
          await http()
            .post('/api/v1/resenas')
            .send({ tipo: 'CLASE', registroId: ids.reservaReciente, calActividad: 5 })
        ).status,
      ).toBe(401);
    });

    it('QA-28 · el intento de otro rol no dejó reseñas', async () => {
      const resena = await prisma.resena.findUnique({
        where: { reservaId: ids.reservaReciente },
      });

      expect(resena).toBeNull();
    });
  });
});
