import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '@Prisma/services';
import { Prisma, TipoProgreso, type RegistroProgreso } from '@PrismaClient';
import { RutinaRepository } from '../../rutinas/repositories/index.js';
import { ProgresoRepository, type FiltrosProgreso } from '../../progreso/repositories/index.js';
import { ProgresoService } from '../../progreso/services/progreso.service.js';
import { MiembroProgresoService } from './miembro-progreso.service.js';

function registro(id: string, fecha: string, valor: number, tipo: TipoProgreso = TipoProgreso.PESO,
  ejercicio: string | null = null, repeticiones: number | null = null): RegistroProgreso {
  return { id, miembroId: 'miembro-1', fecha: new Date(`${fecha}T00:00:00Z`), tipo,
    valor: new Prisma.Decimal(valor), ejercicio, repeticiones, creadoEn: new Date('2026-11-17T12:00:00Z') };
}
const registros = [
  registro('p2', '2026-11-17', 78.5), registro('m2', '2026-11-17', 70, TipoProgreso.MARCA, 'Press banca', 8),
  registro('p1', '2026-11-16', 80), registro('m1', '2026-11-16', 65, TipoProgreso.MARCA, 'Press banca', 8),
  registro('m0', '2026-11-15', 60, TipoProgreso.MARCA, 'Press banca', 5),
];

describe('BE-14.2: autorización y reutilización real de H16 con Prisma simulado', () => {
  const prisma = { rutina: { findFirst: vi.fn() }, miembro: { findUnique: vi.fn() }, registroProgreso: { findMany: vi.fn() } };
  const progreso = new ProgresoService(new ProgresoRepository(prisma as unknown as PrismaService));
  const service = new MiembroProgresoService(new RutinaRepository(prisma as unknown as PrismaService), progreso);
  let rutinas: { id: string; entrenadorId: string; miembroId: string; fechaInicio: string }[];

  beforeEach(() => {
    vi.resetAllMocks();
    rutinas = [{ id: 'r1', entrenadorId: 'entrenador-1', miembroId: 'miembro-1', fechaInicio: '2000-01-01' }];
    prisma.rutina.findFirst.mockImplementation(async ({ where }: { where: { entrenadorId: string; miembroId: string } }) => {
      const encontrada = rutinas.find((r) => r.entrenadorId === where.entrenadorId && r.miembroId === where.miembroId);
      return encontrada ? { id: encontrada.id } : null;
    });
    prisma.miembro.findUnique.mockResolvedValue({ id: 'miembro-1' });
    prisma.registroProgreso.findMany.mockImplementation(async ({ where }: { where: {
      miembroId: string; tipo?: TipoProgreso; fecha?: { gte?: Date; lte?: Date };
    } }) => registros.filter((r) => r.miembroId === where.miembroId && (!where.tipo || r.tipo === where.tipo)
      && (!where.fecha?.gte || r.fecha >= where.fecha.gte) && (!where.fecha?.lte || r.fecha <= where.fecha.lte)));
  });

  it('autoriza una asignación pasada sin cargar días ni ejercicios y usa el UUID del miembro', async () => {
    const resultado = await service.consultar('entrenador-1', 'miembro-1', {});
    expect(resultado.series.length).toBeGreaterThan(0);
    expect(prisma.rutina.findFirst).toHaveBeenCalledWith({
      where: { entrenadorId: 'entrenador-1', miembroId: 'miembro-1' }, select: { id: true },
    });
    expect(prisma.miembro.findUnique).not.toHaveBeenCalled(); // No confunde miembroId con usuarioId.
    expect(prisma.rutina.findFirst.mock.invocationCallOrder[0]).toBeLessThan(prisma.registroProgreso.findMany.mock.invocationCallOrder[0]!);
  });

  it.each(['sin-rutinas', 'otro-entrenador', 'otro-miembro', 'miembro-inexistente'])('rechaza %s con 403 sin leer progreso', async (caso) => {
    if (caso === 'sin-rutinas') rutinas = [];
    const entrenador = caso === 'otro-entrenador' ? 'entrenador-2' : 'entrenador-1';
    const miembro = ['otro-miembro', 'miembro-inexistente'].includes(caso) ? caso : 'miembro-1';
    await expect(service.consultar(entrenador, miembro, {})).rejects.toThrow(ForbiddenException);
    expect(prisma.registroProgreso.findMany).not.toHaveBeenCalled();
    expect(prisma.miembro.findUnique).not.toHaveBeenCalled();
  });

  it('varias rutinas del mismo entrenador no duplican registros y una futura también autoriza', async () => {
    rutinas.push({ id: 'r2', entrenadorId: 'entrenador-1', miembroId: 'miembro-1', fechaInicio: '2099-01-01' });
    const varias = await service.consultar('entrenador-1', 'miembro-1', {});
    rutinas.shift();
    expect(await service.consultar('entrenador-1', 'miembro-1', {})).toEqual(varias);
    expect(varias.series.find((s) => s.tipo === TipoProgreso.PESO)?.registros).toHaveLength(2);
  });

  it('devuelve series vacías si está autorizado sin progreso', async () => {
    prisma.registroProgreso.findMany.mockResolvedValue([]);
    expect(await service.consultar('entrenador-1', 'miembro-1', {})).toEqual({ series: [] });
  });

  it.each([
    {}, { tipo: TipoProgreso.PESO }, { desde: '2026-11-17' }, { hasta: '2026-11-16' },
    { tipo: TipoProgreso.MARCA, desde: '2026-11-16', hasta: '2026-11-17' },
  ])('produce exactamente lo mismo que listarMio con filtros %j', async (query) => {
    const entrenador = await service.consultar('entrenador-1', 'miembro-1', query);
    const miembro = await progreso.listarMio('usuario-del-miembro', query);
    expect(entrenador).toEqual(miembro);
    expect(prisma.miembro.findUnique).toHaveBeenLastCalledWith({ where: { usuarioId: 'usuario-del-miembro' }, select: { id: true } });
    expect(prisma.registroProgreso.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ miembroId: 'miembro-1' }),
      orderBy: [{ fecha: 'desc' }, { creadoEn: 'desc' }, { id: 'desc' }],
    }));
  });

  it('mantiene separación de marcas, orden, redondeo y valores nulos de H16', async () => {
    const { series } = await service.consultar('entrenador-1', 'miembro-1', {});
    expect(series).toHaveLength(3);
    expect(series[0]).toMatchObject({ tipo: TipoProgreso.PESO, primero: 80, ultimo: 78.5, diferencia: -1.5, porcentaje: -1.9 });
    expect(series[0]?.registros.map((r) => r.id)).toEqual(['p2', 'p1']);
    expect(series[1]).toMatchObject({ ejercicio: 'Press banca', repeticiones: 8, primero: 65, ultimo: 70, diferencia: 5, porcentaje: 7.7 });
    expect(series[2]).toMatchObject({ ejercicio: 'Press banca', repeticiones: 5, primero: 60, ultimo: 60, diferencia: null, porcentaje: null });
  });

  it('convierte fechas e incluye ambos extremos del rango', async () => {
    const spy = vi.spyOn(ProgresoRepository.prototype, 'listar');
    try {
      const resultado = await service.consultar('entrenador-1', 'miembro-1', { tipo: TipoProgreso.PESO, desde: '2026-11-16', hasta: '2026-11-17' });
      const filtro: FiltrosProgreso = { tipo: TipoProgreso.PESO, desde: new Date('2026-11-16T00:00:00Z'), hasta: new Date('2026-11-17T00:00:00Z') };
      expect(spy).toHaveBeenCalledWith('miembro-1', filtro);
      expect(resultado.series[0]?.registros).toHaveLength(2);
    } finally { spy.mockRestore(); }
  });

  it.each([{ desde: '2026-02-30' }, { desde: '2026-11-18', hasta: '2026-11-17' }])('rechaza fechas inválidas antes de leer progreso %j', async (query) => {
    await expect(service.consultar('entrenador-1', 'miembro-1', query)).rejects.toThrow(BadRequestException);
    expect(prisma.registroProgreso.findMany).not.toHaveBeenCalled();
  });
});
