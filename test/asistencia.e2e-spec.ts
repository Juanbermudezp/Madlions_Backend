// QA-19.1 · Pruebas del registro de asistencia (H19)

import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '@Prisma/services';
import {
    AsistenciaReserva,
    AsistenciaSesion,
    EstadoClase,
    EstadoReserva,
} from '@PrismaClient';

const MARCA_PRUEBA = '[QA-19.1]';
const CORREOS = {
  ENTRENADOR: 'entrenador@madlions.com',
  ENTRENADOR2: 'entrenador2@madlions.com',
  ADMINISTRADOR: 'admin@madlions.com',
  RECEPCION: 'recepcion@madlions.com',
  MIEMBRO: 'miembro@madlions.com',
} as const;
type RolPrueba = keyof typeof CORREOS;
const NO_ENTRENADORES: RolPrueba[] = ['ADMINISTRADOR', 'RECEPCION', 'MIEMBRO'];
const PASSWORD = 'Demo1234!';

const HORA = 60 * 60 * 1000;
const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';
const FUERA_DE_VENTANA =
  'La asistencia solo se registra desde el inicio hasta 24 horas después del fin.';

interface MiembroActividad {
  registroId: string;
  nombre: string;
  codigo: string;
  asistencia: AsistenciaReserva;
}

interface Actividad {
  tipo: 'CLASE' | 'SESION';
  id: string;
  nombre: string;
  inicio: string;
  fin: string;
  miembros: MiembroActividad[];
}

describe('QA-19.1 · Registro de asistencia (H19)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const token: Record<string, string> = {};
  let entrenadorId: string;
  let entrenador2Id: string;

  // Parejas (miembro, membresía) del seed, para que las reservas sean válidas.
  let socios: { miembroId: string; membresiaId: string }[] = [];

  const ids = {
    claseEnVentana: '',
    claseFutura: '',
    claseVieja: '',
    claseDeOtro: '',
    claseCancelada: '',
    sesionEnVentana: '',
    reservaA: '',
    reservaB: '',
    reservaCancelada: '',
    reservaFutura: '',
    reservaVieja: '',
    reservaDeOtro: '',
  };

  const http = () => request(app.getHttpServer());
  const como = (rol: RolPrueba) => ({ Authorization: `Bearer ${token[rol]}` });

  const pendientes = (rol: RolPrueba) =>
    http().get('/api/v1/asistencia/pendientes').set(como(rol));

  const marcar = (rol: RolPrueba, marcas: unknown) =>
    http().put('/api/v1/asistencia').set(como(rol)).send({ marcas });

  const mensaje = (body: { message: string | string[] }) =>
    Array.isArray(body.message) ? body.message[0] : body.message;

  const buscar = (cuerpo: Actividad[], id: string) => cuerpo.find((a) => a.id === id);

  async function crearClase(
    nombre: string,
    entrenador: string,
    desdeMs: number,
    hastaMs: number,
    estado: EstadoClase = EstadoClase.PROGRAMADA,
  ): Promise<string> {
    const tipoClase = await prisma.tipoClase.findFirstOrThrow({ select: { id: true } });
    const clase = await prisma.clase.create({
      data: {
        tipoClaseId: tipoClase.id,
        entrenadorId: entrenador,
        descripcion: `${MARCA_PRUEBA} ${nombre}`,
        inicio: new Date(Date.now() + desdeMs),
        fin: new Date(Date.now() + hastaMs),
        cupoMaximo: 10,
        estado,
      },
    });
    return clase.id;
  }

  async function crearReserva(
    claseId: string,
    indiceSocio: number,
    cancelada = false,
  ): Promise<string> {
    const socio = socios[indiceSocio];
    const reserva = await prisma.reserva.create({
      data: {
        claseId,
        miembroId: socio.miembroId,
        membresiaId: socio.membresiaId,
        ...(cancelada
          ? { estado: EstadoReserva.CANCELADA_MIEMBRO, canceladaEn: new Date() }
          : {}),
      },
    });
    return reserva.id;
  }

  async function crearSesion(entrenador: string, desdeMs: number): Promise<string> {
    const inicio = new Date(Date.now() + desdeMs);
    const fin = new Date(inicio.getTime() + 60 * 60 * 1000);
    const bloque = await prisma.bloqueDisponibilidad.create({
      data: { entrenadorId: entrenador, inicio, fin, duracionMin: 60, estado: 'OCUPADO' },
    });
    const sesion = await prisma.sesionPersonal.create({
      data: {
        bloqueId: bloque.id,
        miembroId: socios[0].miembroId,
        entrenadorId: entrenador,
        inicio,
        fin,
        precio: 10,
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

    const sesiones = await prisma.sesionPersonal.findMany({
      where: { bloque: { estado: 'OCUPADO', entrenadorId: { in: [entrenadorId, entrenador2Id] } } },
      select: { id: true, bloqueId: true },
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
    entrenador2Id = (
      await prisma.user.findUniqueOrThrow({
        where: { email: CORREOS.ENTRENADOR2 },
        select: { id: true },
      })
    ).id;

    const membresias = await prisma.membresia.findMany({
      distinct: ['miembroId'],
      select: { id: true, miembroId: true },
      take: 4,
    });
    if (membresias.length < 3) {
      throw new Error('Hacen falta 3 miembros con membresía del seed: corre npm run db:seed');
    }
    socios = membresias.map((m) => ({ miembroId: m.miembroId, membresiaId: m.id }));

    await limpiar();

    ids.claseEnVentana = await crearClase('en ventana', entrenadorId, -2 * HORA, -1 * HORA);
    ids.claseFutura = await crearClase('futura', entrenadorId, 2 * HORA, 3 * HORA);
    ids.claseVieja = await crearClase('vieja', entrenadorId, -30 * HORA, -29 * HORA);
    ids.claseDeOtro = await crearClase('de otro', entrenador2Id, -2 * HORA, -1 * HORA);
    ids.claseCancelada = await crearClase(
      'cancelada',
      entrenadorId,
      -2 * HORA,
      -1 * HORA,
      EstadoClase.CANCELADA_GIMNASIO,
    );

    ids.reservaA = await crearReserva(ids.claseEnVentana, 0);
    ids.reservaB = await crearReserva(ids.claseEnVentana, 1);
    ids.reservaCancelada = await crearReserva(ids.claseEnVentana, 2, true);
    ids.reservaFutura = await crearReserva(ids.claseFutura, 0);
    ids.reservaVieja = await crearReserva(ids.claseVieja, 0);
    ids.reservaDeOtro = await crearReserva(ids.claseDeOtro, 0);

    ids.sesionEnVentana = await crearSesion(entrenadorId, -2 * HORA);
  });

  afterAll(async () => {
    await limpiar();
    await app.close();
  });

  describe('Criterio 1 · El entrenador ve sus clases y sesiones de la ventana, con sus miembros', () => {
    it('QA-01 · la clase que ya empezó y terminó hace menos de 24 h aparece', async () => {
      const res = await pendientes('ENTRENADOR');

      expect(res.status).toBe(200);
      const clase = buscar(res.body as Actividad[], ids.claseEnVentana);
      expect(clase).toBeDefined();
      expect(clase!.tipo).toBe('CLASE');
      expect(clase!.nombre).toBeTruthy();
      expect(Number.isNaN(new Date(clase!.inicio).getTime())).toBe(false);
    });

    it('QA-02 · cada miembro llega con su registro, nombre, código y asistencia', async () => {
      const cuerpo = (await pendientes('ENTRENADOR')).body as Actividad[];
      const clase = buscar(cuerpo, ids.claseEnVentana)!;
      const miembro = clase.miembros.find((m) => m.registroId === ids.reservaA);

      expect(miembro).toBeDefined();
      expect(miembro!.nombre.trim().length).toBeGreaterThan(0);
      expect(miembro!.codigo).toMatch(/^MBR-/);
      expect(miembro!.asistencia).toBe(AsistenciaReserva.SIN_REGISTRAR);
    });

    it('QA-03 · la sesión personal también aparece, con su miembro', async () => {
      const cuerpo = (await pendientes('ENTRENADOR')).body as Actividad[];
      const sesion = buscar(cuerpo, ids.sesionEnVentana);

      expect(sesion).toBeDefined();
      expect(sesion!.tipo).toBe('SESION');
      expect(sesion!.miembros).toHaveLength(1);
      expect(sesion!.miembros[0].registroId).toBe(ids.sesionEnVentana);
    });

    it('QA-04 · la clase que todavía no empieza no aparece', async () => {
      const cuerpo = (await pendientes('ENTRENADOR')).body as Actividad[];

      expect(buscar(cuerpo, ids.claseFutura)).toBeUndefined();
    });

    it('QA-05 · la clase que terminó hace más de 24 h no aparece', async () => {
      const cuerpo = (await pendientes('ENTRENADOR')).body as Actividad[];

      expect(buscar(cuerpo, ids.claseVieja)).toBeUndefined();
    });

    it('QA-06 · la clase de otro entrenador no aparece', async () => {
      const cuerpo = (await pendientes('ENTRENADOR')).body as Actividad[];

      expect(buscar(cuerpo, ids.claseDeOtro)).toBeUndefined();
      expect(buscar((await pendientes('ENTRENADOR2')).body as Actividad[], ids.claseDeOtro))
        .toBeDefined();
    });

    it('QA-07 · la clase cancelada por el gimnasio no aparece', async () => {
      const cuerpo = (await pendientes('ENTRENADOR')).body as Actividad[];

      expect(buscar(cuerpo, ids.claseCancelada)).toBeUndefined();
    });
  });

  describe('Criterio 2 · Marcar guarda la asistencia con la fecha, la hora y el usuario', () => {
    it('QA-08 · marcar "Asistió" guarda la marca, el entrenador y el instante', async () => {
      const antes = new Date();

      const res = await marcar('ENTRENADOR', [
        { tipo: 'CLASE', registroId: ids.reservaA, asistencia: 'ASISTIO' },
      ]);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        expect.objectContaining({
          tipo: 'CLASE',
          registroId: ids.reservaA,
          asistencia: 'ASISTIO',
        }),
      ]);

      const reserva = await prisma.reserva.findUniqueOrThrow({ where: { id: ids.reservaA } });
      expect(reserva.asistencia).toBe(AsistenciaReserva.ASISTIO);
      expect(reserva.asistenciaRegistradaPorId).toBe(entrenadorId);
      expect(reserva.asistenciaRegistradaEn!.getTime()).toBeGreaterThanOrEqual(antes.getTime());
    });

    it('QA-09 · marcar "No asistió" también se guarda', async () => {
      await marcar('ENTRENADOR', [
        { tipo: 'CLASE', registroId: ids.reservaB, asistencia: 'NO_ASISTIO' },
      ]);

      const reserva = await prisma.reserva.findUniqueOrThrow({ where: { id: ids.reservaB } });
      expect(reserva.asistencia).toBe(AsistenciaReserva.NO_ASISTIO);
    });

    it('QA-10 · la sesión personal se marca igual que la reserva', async () => {
      const res = await marcar('ENTRENADOR', [
        { tipo: 'SESION', registroId: ids.sesionEnVentana, asistencia: 'ASISTIO' },
      ]);

      expect(res.status).toBe(200);
      const sesion = await prisma.sesionPersonal.findUniqueOrThrow({
        where: { id: ids.sesionEnVentana },
      });
      expect(sesion.asistencia).toBe(AsistenciaSesion.ASISTIO);
      expect(sesion.asistenciaRegistradaPorId).toBe(entrenadorId);
      expect(sesion.asistenciaRegistradaEn).not.toBeNull();
    });

    it('QA-11 · la marca se ve al volver a consultar los pendientes', async () => {
      const cuerpo = (await pendientes('ENTRENADOR')).body as Actividad[];
      const clase = buscar(cuerpo, ids.claseEnVentana)!;

      expect(clase.miembros.find((m) => m.registroId === ids.reservaA)!.asistencia).toBe(
        AsistenciaReserva.ASISTIO,
      );
    });
  });

  describe('Criterio 3 · La marca se puede corregir dentro de la misma ventana', () => {
    it('QA-12 · cambiar la marca guarda la nueva y actualiza el registro', async () => {
      const reservaAntes = await prisma.reserva.findUniqueOrThrow({
        where: { id: ids.reservaA },
      });

      const res = await marcar('ENTRENADOR', [
        { tipo: 'CLASE', registroId: ids.reservaA, asistencia: 'NO_ASISTIO' },
      ]);

      expect(res.status).toBe(200);
      const reservaDespues = await prisma.reserva.findUniqueOrThrow({
        where: { id: ids.reservaA },
      });
      expect(reservaDespues.asistencia).toBe(AsistenciaReserva.NO_ASISTIO);
      expect(reservaDespues.asistenciaRegistradaEn!.getTime()).toBeGreaterThanOrEqual(
        reservaAntes.asistenciaRegistradaEn!.getTime(),
      );
    });

    it('QA-13 · y se puede volver a dejar como estaba', async () => {
      await marcar('ENTRENADOR', [
        { tipo: 'CLASE', registroId: ids.reservaA, asistencia: 'ASISTIO' },
      ]);

      const reserva = await prisma.reserva.findUniqueOrThrow({ where: { id: ids.reservaA } });
      expect(reserva.asistencia).toBe(AsistenciaReserva.ASISTIO);
    });
  });

  describe('Criterio 4 · "Marcar todos como Asistió"', () => {
    it('QA-14 · varias marcas en una sola petición se guardan todas', async () => {
      const res = await marcar('ENTRENADOR', [
        { tipo: 'CLASE', registroId: ids.reservaA, asistencia: 'ASISTIO' },
        { tipo: 'CLASE', registroId: ids.reservaB, asistencia: 'ASISTIO' },
      ]);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);

      const reservas = await prisma.reserva.findMany({
        where: { id: { in: [ids.reservaA, ids.reservaB] } },
      });
      expect(reservas.every((r) => r.asistencia === AsistenciaReserva.ASISTIO)).toBe(true);
    });

    it('QA-15 · el mismo registro dos veces en el lote da 400', async () => {
      const res = await marcar('ENTRENADOR', [
        { tipo: 'CLASE', registroId: ids.reservaA, asistencia: 'ASISTIO' },
        { tipo: 'CLASE', registroId: ids.reservaA, asistencia: 'NO_ASISTIO' },
      ]);

      expect(res.status).toBe(400);
    });

    it('QA-16 · si una marca del lote es inválida no se guarda ninguna', async () => {
      await marcar('ENTRENADOR', [
        { tipo: 'CLASE', registroId: ids.reservaB, asistencia: 'NO_ASISTIO' },
      ]);

      const res = await marcar('ENTRENADOR', [
        { tipo: 'CLASE', registroId: ids.reservaB, asistencia: 'ASISTIO' },
        { tipo: 'CLASE', registroId: ids.reservaDeOtro, asistencia: 'ASISTIO' },
      ]);

      expect(res.status).toBe(403);
      const reserva = await prisma.reserva.findUniqueOrThrow({ where: { id: ids.reservaB } });
      expect(reserva.asistencia).toBe(AsistenciaReserva.NO_ASISTIO);
    });
  });

  describe('Criterio 5 · Fuera de la ventana el sistema lo rechaza', () => {
    it('QA-17 · antes de que la clase empiece: 409 con el mensaje de la ficha', async () => {
      const res = await marcar('ENTRENADOR', [
        { tipo: 'CLASE', registroId: ids.reservaFutura, asistencia: 'ASISTIO' },
      ]);

      expect(res.status).toBe(409);
      expect(mensaje(res.body as { message: string })).toBe(FUERA_DE_VENTANA);
    });

    it('QA-18 · pasadas las 24 h del fin: 409', async () => {
      const res = await marcar('ENTRENADOR', [
        { tipo: 'CLASE', registroId: ids.reservaVieja, asistencia: 'ASISTIO' },
      ]);

      expect(res.status).toBe(409);
      expect(mensaje(res.body as { message: string })).toBe(FUERA_DE_VENTANA);
    });

    it('QA-19 · la clase rechazada no queda marcada', async () => {
      const reserva = await prisma.reserva.findUniqueOrThrow({ where: { id: ids.reservaVieja } });

      expect(reserva.asistencia).toBe(AsistenciaReserva.SIN_REGISTRAR);
      expect(reserva.asistenciaRegistradaPorId).toBeNull();
      expect(reserva.asistenciaRegistradaEn).toBeNull();
    });

    it('QA-20 · justo dentro de la ventana sí se acepta', async () => {
      // La clase termina dentro de un minuto de cumplir las 24 h.
      const claseAlLimite = await crearClase(
        'al limite',
        entrenadorId,
        -25 * HORA,
        -24 * HORA + 60_000,
      );
      const reserva = await crearReserva(claseAlLimite, 0);

      const res = await marcar('ENTRENADOR', [
        { tipo: 'CLASE', registroId: reserva, asistencia: 'ASISTIO' },
      ]);

      expect(res.status).toBe(200);
    });
  });

  describe('Criterio 6 · Actividad de otro entrenador y reservas canceladas', () => {
    it('QA-21 · marcar una clase de otro entrenador da 403', async () => {
      const res = await marcar('ENTRENADOR', [
        { tipo: 'CLASE', registroId: ids.reservaDeOtro, asistencia: 'ASISTIO' },
      ]);

      expect(res.status).toBe(403);
    });

    it('QA-22 · marcar una sesión de otro entrenador da 403', async () => {
      const res = await marcar('ENTRENADOR2', [
        { tipo: 'SESION', registroId: ids.sesionEnVentana, asistencia: 'ASISTIO' },
      ]);

      expect(res.status).toBe(403);
    });

    it('QA-23 · las reservas canceladas no salen en la lista', async () => {
      const cuerpo = (await pendientes('ENTRENADOR')).body as Actividad[];
      const clase = buscar(cuerpo, ids.claseEnVentana)!;

      expect(clase.miembros.map((m) => m.registroId)).not.toContain(ids.reservaCancelada);
    });

    it('QA-24 · marcar una reserva cancelada da 409', async () => {
      const res = await marcar('ENTRENADOR', [
        { tipo: 'CLASE', registroId: ids.reservaCancelada, asistencia: 'ASISTIO' },
      ]);

      expect(res.status).toBe(409);
    });

    it('QA-25 · un registro que no existe da 404', async () => {
      const res = await marcar('ENTRENADOR', [
        { tipo: 'CLASE', registroId: UUID_INEXISTENTE, asistencia: 'ASISTIO' },
      ]);

      expect(res.status).toBe(404);
    });

    it('QA-26 · solo el entrenador entra a los dos endpoints', async () => {
      for (const rol of NO_ENTRENADORES) {
        expect((await pendientes(rol)).status, `pendientes como ${rol}`).toBe(403);
        expect(
          (await marcar(rol, [{ tipo: 'CLASE', registroId: ids.reservaA, asistencia: 'ASISTIO' }]))
            .status,
          `marcar como ${rol}`,
        ).toBe(403);
      }
    });

    it('QA-27 · sin sesión no se puede ni listar ni marcar', async () => {
      expect((await http().get('/api/v1/asistencia/pendientes')).status).toBe(401);
      expect(
        (
          await http()
            .put('/api/v1/asistencia')
            .send({ marcas: [{ tipo: 'CLASE', registroId: ids.reservaA, asistencia: 'ASISTIO' }] })
        ).status,
      ).toBe(401);
    });
  });

  describe('Criterio 7 · Lo que H20 necesita para "Pendientes de calificar"', () => {
    it('QA-28 · la asistencia "Asistió" queda consultable con su fecha y su entrenador', async () => {
      await marcar('ENTRENADOR', [
        { tipo: 'CLASE', registroId: ids.reservaA, asistencia: 'ASISTIO' },
      ]);

      const calificables = await prisma.reserva.findMany({
        where: { asistencia: AsistenciaReserva.ASISTIO, id: ids.reservaA },
        select: {
          miembroId: true,
          asistenciaRegistradaEn: true,
          asistenciaRegistradaPorId: true,
          clase: { select: { fin: true } },
        },
      });

      expect(calificables).toHaveLength(1);
      expect(calificables[0].asistenciaRegistradaEn).not.toBeNull();
      expect(calificables[0].asistenciaRegistradaPorId).toBe(entrenadorId);
      expect(calificables[0].clase.fin).toBeInstanceOf(Date);
    });

    it('QA-29 · quien quedó "No asistió" no entra en esa consulta', async () => {
      await marcar('ENTRENADOR', [
        { tipo: 'CLASE', registroId: ids.reservaB, asistencia: 'NO_ASISTIO' },
      ]);

      const calificables = await prisma.reserva.findMany({
        where: { asistencia: AsistenciaReserva.ASISTIO, id: ids.reservaB },
      });

      expect(calificables).toHaveLength(0);
    });
  });
});
