import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { JwtAuthGuard, RolesGuard } from '@Auth/guards';
import type { UsersService } from '@Users/services';
import { PrismaService } from '@Prisma/services';
import { Prisma, Rol, TipoProgreso } from '@PrismaClient';
import { RutinasModule } from '../../src/rutinas/index.js';
import { MiembrosModule } from '../../src/miembros/index.js';
import type { RutinaCompleta } from '../../src/rutinas/repositories/index.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const M = '33333333-3333-4333-8333-333333333333';
const R = '44444444-4444-4444-8444-444444444444';
const ejercicio = { nombre: 'Press banca', series: 4, repeticiones: 8, descansoSeg: 120 };
const dia = { nombre: 'Día uno', ejercicios: [ejercicio] };
const editable = { nombre: 'Fuerza general QA', objetivo: 'Mejorar fuerza', fechaInicio: '2026-11-18', dias: [dia] };
const variosDias = Array.from({ length: 3 }, (_, i) => ({ nombre: `Día ${i + 1}`, ejercicios: [ejercicio, { ...ejercicio, nombre: 'Remo' }] }));
const entidad: RutinaCompleta = {
  id: R, miembroId: M, entrenadorId: A, nombre: editable.nombre, objetivo: editable.objetivo,
  fechaInicio: new Date('2026-11-18T00:00:00Z'), creadoEn: new Date('2026-11-17T12:00:00Z'), actualizadoEn: new Date('2026-11-17T12:00:00Z'),
  miembro: { id: M, codigoMiembro: 'MBR-999001', usuario: { nombre: 'Miembro', apellido: 'QA' } },
  dias: variosDias.map((d, i) => ({ id: `dia-${i}`, rutinaId: R, orden: i + 1, nombre: d.nombre,
    ejercicios: d.ejercicios.map((e, j) => ({ id: `ej-${i}-${j}`, diaId: `dia-${i}`, orden: j + 1, ...e })),
  })),
};

/** Contrato HTTP real de Nest; Prisma y verificación criptográfica simulados.
 * No importa AppModule ni lee .env, y reemplaza PrismaService ANTES de init().
 * No es e2e con PostgreSQL ni una prueba de restricciones/transacciones SQL.
 */
describe('QA-H14 contrato HTTP Nest con Prisma simulado', () => {
  let app: INestApplication;
  const prisma = {
    miembro: { findUnique: vi.fn() }, $queryRaw: vi.fn(), $transaction: vi.fn(),
    rutina: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    rutinaDia: { deleteMany: vi.fn() }, registroProgreso: { findMany: vi.fn() },
  };
  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [RutinasModule, MiembrosModule] })
      .overrideProvider(PrismaService).useValue(prisma).compile();
    app = modulo.createNestApplication({ logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    const reflector = modulo.get(Reflector);
    const jwt = { verifyAsync: vi.fn(async (token: string) => ({ sub: token })) };
    const users = { findById: vi.fn(async (id: string) => [A, B, M].includes(id)
      ? { id, rol: id === M ? Rol.MIEMBRO : Rol.ENTRENADOR, isActive: true } : null) };
    app.useGlobalGuards(new JwtAuthGuard(reflector, jwt as unknown as JwtService, users as unknown as UsersService), new RolesGuard(reflector));
    await app.init();
  });
  afterAll(async () => { if (app) await app.close(); });
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-17T18:00:00Z'));
    for (const metodo of [prisma.miembro.findUnique, prisma.$queryRaw, prisma.$transaction,
      ...Object.values(prisma.rutina), prisma.rutinaDia.deleteMany, prisma.registroProgreso.findMany]) metodo.mockReset();
    prisma.miembro.findUnique.mockResolvedValue({ id: M });
    prisma.$queryRaw.mockResolvedValue([{ id: M, nombre: 'Miembro', apellido: 'QA', codigo: 'MBR-999001', documento: '99999999-9' }]);
    prisma.$transaction.mockImplementation((operar: (tx: typeof prisma) => Promise<unknown>) => operar(prisma));
    prisma.rutina.create.mockResolvedValue(entidad);
    prisma.rutina.update.mockResolvedValue(entidad);
    prisma.rutina.findUnique.mockResolvedValue(entidad);
    prisma.rutina.findMany.mockResolvedValue([entidad]);
    prisma.rutinaDia.deleteMany.mockResolvedValue({ count: 3 });
    prisma.rutina.findFirst.mockImplementation(async ({ where }: { where: { entrenadorId: string; miembroId: string } }) =>
      where.entrenadorId === A && where.miembroId === M ? { id: R } : null);
    prisma.registroProgreso.findMany.mockResolvedValue([{ id: 'p1', miembroId: M, fecha: new Date('2026-11-17T00:00:00Z'),
      tipo: TipoProgreso.PESO, valor: new Prisma.Decimal('78.5'), ejercicio: null, repeticiones: null, creadoEn: new Date() }]);
  });
  afterEach(() => vi.useRealTimers());
  const api = () => request(app.getHttpServer());
  function sinEscrituras() {
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.rutina.create).not.toHaveBeenCalled();
    expect(prisma.rutina.update).not.toHaveBeenCalled();
    expect(prisma.rutinaDia.deleteMany).not.toHaveBeenCalled();
  }

  it.each(['Miembro QA', 'MBR-999001'])('QA-H14-01: búsqueda HTTP por %s sin datos de recepción', async (q) => {
    const res = await api().get('/api/v1/miembros/buscar').query({ q }).auth(A, { type: 'bearer' }).expect(200);
    expect(res.body).toEqual([{ id: M, nombre: 'Miembro', apellido: 'QA', codigo: 'MBR-999001' }]);
    expect(prisma.$queryRaw).toHaveBeenCalledOnce(); sinEscrituras();
  });
  it('QA-H14-01: POST 201 con tres días y varios ejercicios llega al repositorio real con propietarios/orden correctos', async () => {
    const res = await api().post('/api/v1/rutinas').auth(A, { type: 'bearer' }).send({ ...editable, miembroId: M, dias: variosDias }).expect(201);
    expect(res.body).toMatchObject({ miembroId: M, entrenadorId: A, fechaInicio: '2026-11-18' });
    expect(res.body.dias).toHaveLength(3);
    const guardado = prisma.rutina.create.mock.calls[0]![0].data;
    expect(guardado.miembro).toEqual({ connect: { id: M } });
    expect(guardado.entrenador).toEqual({ connect: { id: A } });
    expect(guardado.dias.create.map((d: { orden: number }) => d.orden)).toEqual([1, 2, 3]);
    for (const d of guardado.dias.create) expect(d.ejercicios.create.map((e: { orden: number }) => e.orden)).toEqual([1, 2]);
  });
  it.each([[1, 1], [7, 15]])('QA-H14-02: admite %i días con %i ejercicios a través de HTTP', async (dias, ejercicios) => {
    await api().post('/api/v1/rutinas').auth(A, { type: 'bearer' }).send({ ...editable, miembroId: M,
      dias: Array.from({ length: dias }, () => ({ nombre: 'Día', ejercicios: Array.from({ length: ejercicios }, () => ejercicio) })),
    }).expect(201);
    const creados = prisma.rutina.create.mock.calls[0]![0].data.dias.create;
    expect(creados).toHaveLength(dias);
    for (const d of creados) expect(d.ejercicios.create).toHaveLength(ejercicios);
  });
  it.each([
    ['0 días', { dias: [] }], ['8 días', { dias: Array(8).fill(dia) }],
    ['0 ejercicios', { dias: [{ ...dia, ejercicios: [] }] }], ['16 ejercicios', { dias: [{ ...dia, ejercicios: Array(16).fill(ejercicio) }] }],
    ['series 0', { dias: [{ ...dia, ejercicios: [{ ...ejercicio, series: 0 }] }] }],
    ['repeticiones 0', { dias: [{ ...dia, ejercicios: [{ ...ejercicio, repeticiones: 0 }] }] }],
    ['descanso -5', { dias: [{ ...dia, ejercicios: [{ ...ejercicio, descansoSeg: -5 }] }] }],
    ['nombre corto', { nombre: 'ab' }], ['nombre largo', { nombre: 'x'.repeat(61) }],
    ['fecha pasada', { fechaInicio: '2026-11-16' }], ['fecha inexistente', { fechaInicio: '2026-02-30' }],
    ['series superiores', { dias: [{ ...dia, ejercicios: [{ ...ejercicio, series: 11 }] }] }],
  ])('QA-H14-02/05: HTTP 400 sin operaciones de escritura: %s', async (_caso, cambios) => {
    await api().post('/api/v1/rutinas').auth(A, { type: 'bearer' }).send({ ...editable, miembroId: M, ...cambios }).expect(400);
    sinEscrituras();
  });
  it('QA-H14-04/06: A puede editar y reemplazar toda la distribución; B recibe 403 sin escribir', async () => {
    await api().put(`/api/v1/rutinas/${R}`).auth(B, { type: 'bearer' }).send(editable).expect(403);
    sinEscrituras();
    await api().put(`/api/v1/rutinas/${R}`).auth(A, { type: 'bearer' }).send({ ...editable, dias: [variosDias[1]] }).expect(200);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(prisma.rutinaDia.deleteMany).toHaveBeenCalledWith({ where: { rutinaId: R, rutina: { entrenadorId: A } } });
    expect(prisma.rutina.update.mock.calls[1]![0].data.dias.create).toHaveLength(1);
    expect(prisma.rutina.update.mock.calls[1]![0].where).toEqual({ id: R, entrenadorId: A });
  });
  it.each(['post', 'put'] as const)('QA-H14-06: MIEMBRO recibe 403 en %s sin escrituras', async (metodo) => {
    const ruta = metodo === 'post' ? '/api/v1/rutinas' : `/api/v1/rutinas/${R}`;
    await api()[metodo](ruta).auth(M, { type: 'bearer' }).send({ ...editable, ...(metodo === 'post' ? { miembroId: M } : {}) }).expect(403);
    sinEscrituras();
  });
  it('QA-H14-07: A consulta con 200; B recibe 403 antes de leer progreso', async () => {
    await api().get(`/api/v1/miembros/${M}/progreso`).auth(B, { type: 'bearer' }).expect(403);
    expect(prisma.registroProgreso.findMany).not.toHaveBeenCalled();
    const res = await api().get(`/api/v1/miembros/${M}/progreso`).auth(A, { type: 'bearer' }).expect(200);
    expect(res.body.series[0]).toMatchObject({ tipo: 'PESO', primero: 78.5, ultimo: 78.5, diferencia: null, porcentaje: null });
    sinEscrituras();
  });
  it('QA-H14-06/07: HTTP 401 sin token y 400 con UUID inválido', async () => {
    await api().get(`/api/v1/miembros/${M}/progreso`).expect(401);
    await api().get('/api/v1/miembros/invalido/progreso').auth(A, { type: 'bearer' }).expect(400);
    expect(prisma.rutina.findFirst).not.toHaveBeenCalled();
    expect(prisma.registroProgreso.findMany).not.toHaveBeenCalled(); sinEscrituras();
  });
});
