import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { JwtAuthGuard, RolesGuard } from '@Auth/guards';
import type { UsersService } from '@Users/services';
import { PrismaService } from '@Prisma/services';
import { Rol } from '@PrismaClient';
import { RutinasModule } from '../../src/rutinas/index.js';
import type { RutinaCompleta } from '../../src/rutinas/repositories/index.js';
import { detalle, ENTRENADOR, MIEMBRO_A, MIEMBRO_B, resumenAnterior, resumenReciente, RUTINA_A, RUTINA_B, USUARIO_A, USUARIO_B } from '../fixtures/rutinas-miembro.fixture.js';

const RECEPCION = '88888888-8888-4888-8888-888888888888';
const ADMIN = '99999999-9999-4999-8999-999999999999';

/** Nest, controladores, servicios, repositorios, pipes y guards reales.
 * Prisma, verificación de JWT y carga de usuario simulados; no usa PostgreSQL.
 * PrismaService se sustituye antes de init(): no hay conexión ni escrituras SQL.
 */
describe('BE-15.1 contrato HTTP y autorización de rutinas propias', () => {
  let app: INestApplication;
  const prisma = {
    miembro: { findUnique: vi.fn() },
    rutina: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    rutinaDia: { deleteMany: vi.fn() }, $transaction: vi.fn(),
  };
  const cuentas = new Map([
    [USUARIO_A, Rol.MIEMBRO], [USUARIO_B, Rol.MIEMBRO],
    [ENTRENADOR, Rol.ENTRENADOR], [RECEPCION, Rol.RECEPCION], [ADMIN, Rol.ADMINISTRADOR],
  ]);
  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [RutinasModule] })
      .overrideProvider(PrismaService).useValue(prisma).compile();
    app = modulo.createNestApplication({ logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    const reflector = modulo.get(Reflector);
    const jwt = { verifyAsync: vi.fn(async (token: string) => ({ sub: token })) };
    const users = { findById: vi.fn(async (id: string) => cuentas.has(id)
      ? { id, rol: cuentas.get(id), isActive: true } : null) };
    app.useGlobalGuards(new JwtAuthGuard(reflector, jwt as unknown as JwtService, users as unknown as UsersService), new RolesGuard(reflector));
    await app.init();
  });
  afterAll(async () => { if (app) await app.close(); });
  beforeEach(() => {
    vi.resetAllMocks();
    prisma.miembro.findUnique.mockImplementation(async ({ where }: { where: { usuarioId: string } }) =>
      ({ id: where.usuarioId === USUARIO_B ? MIEMBRO_B : MIEMBRO_A }));
    prisma.rutina.findMany.mockResolvedValue([resumenReciente, resumenAnterior]);
    prisma.rutina.findUnique.mockResolvedValue({ miembroId: MIEMBRO_A });
    prisma.rutina.findFirst.mockResolvedValue(detalle);
  });
  const api = () => request(app.getHttpServer());

  it('GET /mias entrega dos resúmenes, fechas DATE y entrenador, con orden determinista en Prisma', async () => {
    const res = await api().get('/api/v1/rutinas/mias').auth(USUARIO_A, { type: 'bearer' }).expect(200);
    expect(res.body).toEqual([
      { id: RUTINA_A, nombre: 'Fuerza general', objetivo: 'Mejorar fuerza', fechaInicio: '2026-11-18', entrenador: resumenReciente.entrenador },
      { id: RUTINA_B, nombre: 'Fuerza inicial', objetivo: 'Mejorar fuerza', fechaInicio: '2026-11-16', entrenador: resumenReciente.entrenador },
    ]);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(prisma.miembro.findUnique).toHaveBeenCalledWith({ where: { usuarioId: USUARIO_A }, select: { id: true } });
    expect(prisma.rutina.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { miembroId: MIEMBRO_A }, orderBy: [{ fechaInicio: 'desc' }, { creadoEn: 'desc' }, { id: 'asc' }],
    }));
    expect(prisma.rutina.findUnique).not.toHaveBeenCalled(); // /mias no cae en /:id.
  });
  it('miembro sin asignaciones recibe []', async () => {
    prisma.rutina.findMany.mockResolvedValue([]);
    const res = await api().get('/api/v1/rutinas/mias').auth(USUARIO_A, { type: 'bearer' }).expect(200);
    expect(res.body).toEqual([]);
  });
  it('resuelve por separado la ficha del segundo usuario', async () => {
    prisma.rutina.findMany.mockResolvedValue([resumenAnterior]);
    await api().get('/api/v1/rutinas/mias').auth(USUARIO_B, { type: 'bearer' }).expect(200);
    expect(prisma.miembro.findUnique).toHaveBeenCalledWith({ where: { usuarioId: USUARIO_B }, select: { id: true } });
    expect(prisma.rutina.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { miembroId: MIEMBRO_B } }));
  });
  it('detalle solo incluye campos públicos y exige ordenar días y ejercicios en Prisma', async () => {
    // Incluso si el adaptador devolviese campos extra, el mapper no los serializa.
    prisma.rutina.findFirst.mockResolvedValue({ ...detalle, miembroId: MIEMBRO_A, entrenadorId: ENTRENADOR,
      entrenador: { ...detalle.entrenador, email: 'privado@example.invalid' } });
    const res = await api().get(`/api/v1/rutinas/${RUTINA_A}`).auth(USUARIO_A, { type: 'bearer' }).expect(200);
    expect(res.body).toEqual({ id: RUTINA_A, nombre: detalle.nombre, objetivo: detalle.objetivo,
      fechaInicio: '2026-11-18', entrenador: detalle.entrenador, dias: detalle.dias });
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(prisma.rutina.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: RUTINA_A, miembroId: MIEMBRO_A },
      select: expect.objectContaining({ dias: expect.objectContaining({ orderBy: { orden: 'asc' },
        select: expect.objectContaining({ ejercicios: expect.objectContaining({ orderBy: { orden: 'asc' } }) }) }) }),
    }));
  });
  it('dos GET de detalle consultan de nuevo y muestran la edición actual', async () => {
    const inicial = await api().get(`/api/v1/rutinas/${RUTINA_A}`).auth(USUARIO_A, { type: 'bearer' }).expect(200);
    const actualizada = { ...detalle, nombre: 'Fuerza actualizada', dias: [{ ...detalle.dias[0]!, ejercicios: [
      { ...detalle.dias[0]!.ejercicios[0]!, series: 5, descansoSeg: 180 },
    ] }] };
    prisma.rutina.findFirst.mockResolvedValue(actualizada);
    const actual = await api().get(`/api/v1/rutinas/${RUTINA_A}`).auth(USUARIO_A, { type: 'bearer' }).expect(200);
    expect(inicial.body.nombre).toBe('Fuerza general');
    expect(actual.body.nombre).toBe('Fuerza actualizada');
    expect(actual.body.dias).toEqual(actualizada.dias);
    expect(prisma.rutina.findFirst).toHaveBeenCalledTimes(2);
    expect(prisma.rutina.findUnique).toHaveBeenCalledTimes(2);
  });
  it('QA-H15-03: GET miembro -> PUT H14 entrenador -> GET miembro usa el reemplazo completo, con almacenamiento simulado', async () => {
    // Estado solo en memoria. Comprueba composición HTTP y coordinación real de
    // H14/H15; no demuestra commit, cascadas ni aislamiento de PostgreSQL.
    let guardado: RutinaCompleta = {
      id: RUTINA_A, nombre: detalle.nombre, objetivo: detalle.objetivo, fechaInicio: detalle.fechaInicio,
      miembroId: MIEMBRO_A, entrenadorId: ENTRENADOR,
      creadoEn: new Date('2026-11-17T12:00:00Z'), actualizadoEn: new Date('2026-11-17T12:00:00Z'),
      miembro: { id: MIEMBRO_A, codigoMiembro: 'MBR-999001', usuario: { nombre: 'Miembro', apellido: 'QA' } },
      dias: detalle.dias.map((d) => ({ ...d, rutinaId: RUTINA_A, ejercicios: d.ejercicios.map((e) => ({ ...e, diaId: d.id })) })),
    };
    prisma.rutina.findUnique.mockImplementation(async ({ where, select }: { where: { id: string }; select?: { miembroId: boolean } }) =>
      where.id !== guardado.id ? null : select ? { miembroId: guardado.miembroId } : guardado);
    prisma.rutina.findFirst.mockImplementation(async ({ where }: { where: { id: string; miembroId: string } }) =>
      where.id === guardado.id && where.miembroId === guardado.miembroId ? { ...guardado, entrenador: resumenReciente.entrenador } : null);
    prisma.rutina.findMany.mockImplementation(async ({ where }: { where: { miembroId: string } }) =>
      where.miembroId === guardado.miembroId ? [{ ...guardado, entrenador: resumenReciente.entrenador }] : []);
    prisma.$transaction.mockImplementation((operar: (tx: typeof prisma) => Promise<unknown>) => operar(prisma));
    prisma.rutinaDia.deleteMany.mockImplementation(async () => {
      const count = guardado.dias.length;
      guardado = { ...guardado, dias: [] };
      return { count };
    });
    type EjercicioNuevo = { orden: number; nombre: string; series: number; repeticiones: number; descansoSeg: number };
    type DiaNuevo = { orden: number; nombre: string; ejercicios: { create: EjercicioNuevo[] } };
    prisma.rutina.update.mockImplementation(async ({ data }: { data: {
      nombre?: string; objetivo?: string; fechaInicio?: Date; dias?: { create: DiaNuevo[] };
    } }) => {
      guardado = { ...guardado, nombre: data.nombre ?? guardado.nombre, objetivo: data.objetivo ?? guardado.objetivo,
        fechaInicio: data.fechaInicio ?? guardado.fechaInicio };
      if (data.dias) guardado.dias = data.dias.create.map((d) => ({ id: `nuevo-dia-${d.orden}`, rutinaId: RUTINA_A,
        orden: d.orden, nombre: d.nombre, ejercicios: d.ejercicios.create.map((e) => ({
          ...e, id: `nuevo-ej-${d.orden}-${e.orden}`, diaId: `nuevo-dia-${d.orden}`,
        })),
      }));
      return guardado;
    });

    const inicial = await api().get(`/api/v1/rutinas/${RUTINA_A}`).auth(USUARIO_A, { type: 'bearer' }).expect(200);
    expect(inicial.body.dias).toEqual(detalle.dias);
    const cambios = { nombre: 'QA H15 fuerza revisada', objetivo: 'Comprobar reemplazo visible', fechaInicio: '2099-11-18', dias: [
      { nombre: 'Posterior', ejercicios: [{ nombre: 'Peso muerto', series: 5, repeticiones: 6, descansoSeg: 180 }] },
    ] };
    const edicion = await api().put(`/api/v1/rutinas/${RUTINA_A}`).auth(ENTRENADOR, { type: 'bearer' }).send(cambios).expect(200);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(prisma.rutina.update).toHaveBeenCalledTimes(2);
    expect(prisma.rutinaDia.deleteMany).toHaveBeenCalledWith({ where: { rutinaId: RUTINA_A, rutina: { entrenadorId: ENTRENADOR } } });
    const actual = await api().get(`/api/v1/rutinas/${RUTINA_A}`).auth(USUARIO_A, { type: 'bearer' }).expect(200);
    expect(actual.body).toMatchObject({ nombre: cambios.nombre, objetivo: cambios.objetivo, fechaInicio: cambios.fechaInicio,
      entrenador: resumenReciente.entrenador, dias: [{ orden: 1, nombre: 'Posterior', ejercicios: [{ orden: 1, ...cambios.dias[0]!.ejercicios[0] }] }] });
    expect(actual.body.dias).toHaveLength(1);
    expect(actual.body.dias).toEqual(edicion.body.dias);
    expect(JSON.stringify(actual.body)).not.toContain('Press banca');
    expect(JSON.stringify(actual.body)).not.toContain('Sentadilla');
    const lista = await api().get('/api/v1/rutinas/mias').auth(USUARIO_A, { type: 'bearer' }).expect(200);
    expect(lista.body).toEqual([{ id: RUTINA_A, nombre: cambios.nombre, objetivo: cambios.objetivo,
      fechaInicio: cambios.fechaInicio, entrenador: resumenReciente.entrenador }]);
  });
  it('propietario B recibe su detalle; A recibe 403 antes de leerlo', async () => {
    prisma.rutina.findUnique.mockResolvedValue({ miembroId: MIEMBRO_B });
    await api().get(`/api/v1/rutinas/${RUTINA_A}`).auth(USUARIO_A, { type: 'bearer' }).expect(403);
    expect(prisma.rutina.findFirst).not.toHaveBeenCalled();
    await api().get(`/api/v1/rutinas/${RUTINA_A}`).auth(USUARIO_B, { type: 'bearer' }).expect(200);
    expect(prisma.rutina.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: RUTINA_A, miembroId: MIEMBRO_B } }));
  });
  it('rutina inexistente recibe 404 sin consultar sus hijos', async () => {
    prisma.rutina.findUnique.mockResolvedValue(null);
    await api().get(`/api/v1/rutinas/${RUTINA_A}`).auth(USUARIO_A, { type: 'bearer' }).expect(404);
    expect(prisma.rutina.findFirst).not.toHaveBeenCalled();
  });
  it('UUID inválido recibe 400 antes del servicio', async () => {
    await api().get('/api/v1/rutinas/no-es-uuid').auth(USUARIO_A, { type: 'bearer' }).expect(400);
    expect(prisma.miembro.findUnique).not.toHaveBeenCalled();
    expect(prisma.rutina.findUnique).not.toHaveBeenCalled();
  });
  it.each([ENTRENADOR, RECEPCION, ADMIN])('rol no MIEMBRO (%s) recibe 403 en ambas rutas', async (usuario) => {
    await api().get('/api/v1/rutinas/mias').auth(usuario, { type: 'bearer' }).expect(403);
    await api().get(`/api/v1/rutinas/${RUTINA_A}`).auth(usuario, { type: 'bearer' }).expect(403);
    expect(prisma.miembro.findUnique).not.toHaveBeenCalled();
    expect(prisma.rutina.findMany).not.toHaveBeenCalled();
    expect(prisma.rutina.findUnique).not.toHaveBeenCalled();
  });
  it.each(['/api/v1/rutinas/mias', `/api/v1/rutinas/${RUTINA_A}`])('sin autenticación recibe 401 en %s', async (ruta) => {
    await api().get(ruta).expect(401);
    expect(prisma.miembro.findUnique).not.toHaveBeenCalled();
  });
  it('un UUID ajeno en query no sustituye al usuario ni a la ficha', async () => {
    const identidadAjena = { miembroId: MIEMBRO_B, usuarioId: USUARIO_B };
    await api().get('/api/v1/rutinas/mias').query(identidadAjena).auth(USUARIO_A, { type: 'bearer' }).expect(200);
    await api().get(`/api/v1/rutinas/${RUTINA_A}`).query(identidadAjena).auth(USUARIO_A, { type: 'bearer' }).expect(200);
    expect(prisma.miembro.findUnique).toHaveBeenCalledTimes(2);
    expect(prisma.miembro.findUnique).toHaveBeenNthCalledWith(1, { where: { usuarioId: USUARIO_A }, select: { id: true } });
    expect(prisma.miembro.findUnique).toHaveBeenNthCalledWith(2, { where: { usuarioId: USUARIO_A }, select: { id: true } });
    expect(prisma.rutina.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { miembroId: MIEMBRO_A } }));
    expect(prisma.rutina.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: RUTINA_A, miembroId: MIEMBRO_A } }));
    prisma.rutina.findUnique.mockResolvedValue({ miembroId: MIEMBRO_B });
    await api().get(`/api/v1/rutinas/${RUTINA_B}`).query(identidadAjena).auth(USUARIO_A, { type: 'bearer' }).expect(403);
    expect(prisma.rutina.findFirst).toHaveBeenCalledTimes(1);
  });
  it.each(['/api/v1/rutinas/mias', `/api/v1/rutinas/${RUTINA_A}`])('sin ficha recibe 404 en %s', async (ruta) => {
    prisma.miembro.findUnique.mockResolvedValue(null);
    await api().get(ruta).auth(USUARIO_A, { type: 'bearer' }).expect(404);
    expect(prisma.rutina.findMany).not.toHaveBeenCalled();
    expect(prisma.rutina.findUnique).not.toHaveBeenCalled();
  });
  it('H14 /creadas-por-mi sigue siendo ruta estática de entrenador y rechaza al miembro', async () => {
    const entidad: RutinaCompleta = { id: RUTINA_A, nombre: detalle.nombre, objetivo: detalle.objetivo,
      fechaInicio: detalle.fechaInicio, miembroId: MIEMBRO_A, entrenadorId: ENTRENADOR,
      creadoEn: new Date('2026-11-17T12:00:00Z'), actualizadoEn: new Date('2026-11-17T12:00:00Z'),
      miembro: { id: MIEMBRO_A, codigoMiembro: 'MBR-999001', usuario: { nombre: 'Miembro', apellido: 'QA' } },
      dias: detalle.dias.map((d) => ({ ...d, rutinaId: RUTINA_A, ejercicios: d.ejercicios.map((e) => ({ ...e, diaId: d.id })) })),
    };
    prisma.rutina.findMany.mockResolvedValue([entidad]);
    const res = await api().get('/api/v1/rutinas/creadas-por-mi').auth(ENTRENADOR, { type: 'bearer' }).expect(200);
    expect(res.body[0]).toMatchObject({ id: RUTINA_A, entrenadorId: ENTRENADOR, miembroId: MIEMBRO_A });
    expect(prisma.rutina.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { entrenadorId: ENTRENADOR } }));
    await api().get('/api/v1/rutinas/creadas-por-mi').auth(USUARIO_A, { type: 'bearer' }).expect(403);
    expect(prisma.miembro.findUnique).not.toHaveBeenCalled();
    expect(prisma.rutina.findUnique).not.toHaveBeenCalled();
  });
});
