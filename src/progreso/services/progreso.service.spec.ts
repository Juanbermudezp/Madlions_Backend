import { ConflictException, ForbiddenException } from '@nestjs/common';
import { TipoProgreso, type RegistroProgreso } from '@PrismaClient';
import type { ProgresoRepository } from '../repositories/progreso.repository.js';
import { MedicionDuplicadaError } from '../errors/medicion-duplicada.error.js';
import { ProgresoService } from './progreso.service.js';

const registro = (id: string, fecha: string, valor: number, extra: Partial<RegistroProgreso> = {}): RegistroProgreso =>
  ({
    id, miembroId: 'm1', fecha: new Date(`${fecha}T00:00:00Z`),
    tipo: TipoProgreso.PESO, valor: valor as unknown as RegistroProgreso['valor'],
    ejercicio: null, repeticiones: null, creadoEn: new Date(), ...extra,
  });

describe('BE-16.1 ProgresoService', () => {
  const repo = {
    encontrarMiembroId: vi.fn(), findById: vi.fn(), crearMultiples: vi.fn(),
    actualizar: vi.fn(), listar: vi.fn(),
  };
  const service = new ProgresoService(repo as unknown as ProgresoRepository);
  const AHORA = new Date('2026-11-07T20:00:00Z');

  beforeEach(() => {
    vi.resetAllMocks();
    repo.encontrarMiembroId.mockResolvedValue('m1');
  });

  it('registra mediciones solo con el miembro derivado del usuario autenticado', async () => {
    repo.crearMultiples.mockResolvedValue([registro('r1', '2026-11-07', 80)]);
    await service.crear('usuario-1', {
      fecha: '2026-11-07', mediciones: [{ tipo: TipoProgreso.PESO, valor: 80 }],
    }, AHORA);
    expect(repo.encontrarMiembroId).toHaveBeenCalledWith('usuario-1');
    expect(repo.crearMultiples).toHaveBeenCalledWith('m1', new Date('2026-11-07T00:00:00Z'), [{
      tipo: TipoProgreso.PESO, valor: 80, ejercicio: null, repeticiones: null,
    }]);
  });

  it('rechaza una medición duplicada en el mismo POST con 409', async () => {
    await expect(service.crear('u1', {
      fecha: '2026-11-07',
      mediciones: [{ tipo: TipoProgreso.PESO, valor: 80 }, { tipo: TipoProgreso.PESO, valor: 79 }],
    }, AHORA)).rejects.toThrow(ConflictException);
    expect(repo.crearMultiples).not.toHaveBeenCalled();
  });

  it('traduce la unicidad de PostgreSQL a 409', async () => {
    repo.crearMultiples.mockRejectedValue(new MedicionDuplicadaError());
    await expect(service.crear('u1', {
      fecha: '2026-11-07', mediciones: [{ tipo: TipoProgreso.PESO, valor: 80 }],
    }, AHORA)).rejects.toThrow(ConflictException);
  });

  it('rechaza editar registros ajenos con 403', async () => {
    repo.findById.mockResolvedValue(registro('r2', '2026-11-07', 80, { miembroId: 'm2' }));
    await expect(service.editar('u1', 'r2', { valor: 78 }, AHORA)).rejects.toThrow(ForbiddenException);
    expect(repo.actualizar).not.toHaveBeenCalled();
  });

  it('separa las marcas por ejercicio y repeticiones y conserva orden descendente', async () => {
    repo.listar.mockResolvedValue([
      registro('r3', '2026-11-07', 70, { tipo: TipoProgreso.MARCA, ejercicio: 'Press banca', repeticiones: 8 }),
      registro('r2', '2026-11-06', 65, { tipo: TipoProgreso.MARCA, ejercicio: 'Press banca', repeticiones: 8 }),
      registro('r1', '2026-11-05', 60, { tipo: TipoProgreso.MARCA, ejercicio: 'Press banca', repeticiones: 5 }),
    ]);
    const result = await service.listarMio('u1', {});
    expect(result.series).toHaveLength(2);
    expect(result.series[0]).toMatchObject({
      tipo: TipoProgreso.MARCA, ejercicio: 'Press banca', repeticiones: 8,
      primero: 65, ultimo: 70, diferencia: 5, porcentaje: 7.7,
    });
    expect(result.series[0]?.registros.map((r) => r.id)).toEqual(['r3', 'r2']);
    expect(result.series[1]?.diferencia).toBeNull();
  });
});
