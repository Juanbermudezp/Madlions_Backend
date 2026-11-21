import type { PrismaService } from '@Prisma/services';
import { RutinaMiembroRepository } from './rutina-miembro.repository.js';
import { detalle, MIEMBRO_A, resumenAnterior, resumenReciente, RUTINA_A, USUARIO_A } from '../../../test/fixtures/rutinas-miembro.fixture.js';

describe('BE-15.1 RutinaMiembroRepository con Prisma simulado', () => {
  const prisma = { miembro: { findUnique: vi.fn() }, rutina: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() } };
  const repo = new RutinaMiembroRepository(prisma as unknown as PrismaService);
  beforeEach(() => vi.resetAllMocks());
  it('obtiene ficha solo por usuarioId y solo selecciona id', async () => {
    await repo.miembroDeUsuario(USUARIO_A);
    expect(prisma.miembro.findUnique).toHaveBeenCalledWith({ where: { usuarioId: USUARIO_A }, select: { id: true } });
  });
  it('filtra por ficha y ordena fechaInicio/creadoEn/id; solo selecciona resumen seguro', async () => {
    prisma.rutina.findMany.mockResolvedValue([resumenReciente, resumenAnterior]);
    expect(await repo.listarPropias(MIEMBRO_A)).toEqual([resumenReciente, resumenAnterior]);
    expect(prisma.rutina.findMany).toHaveBeenCalledWith({ where: { miembroId: MIEMBRO_A },
      orderBy: [{ fechaInicio: 'desc' }, { creadoEn: 'desc' }, { id: 'asc' }],
      select: { id: true, nombre: true, objetivo: true, fechaInicio: true,
        entrenador: { select: { id: true, nombre: true, apellido: true } } },
    });
  });
  it('autoriza con una consulta mínima sin leer datos de la rutina ajena', async () => {
    await repo.propietario(RUTINA_A);
    expect(prisma.rutina.findUnique).toHaveBeenCalledWith({ where: { id: RUTINA_A }, select: { miembroId: true } });
  });
  it('detalle vuelve a filtrar por dueño, ordena ambas relaciones y hace lecturas nuevas', async () => {
    prisma.rutina.findFirst.mockResolvedValueOnce(detalle).mockResolvedValueOnce(null);
    expect(await repo.detallePropio(RUTINA_A, MIEMBRO_A)).toEqual(detalle);
    expect(await repo.detallePropio(RUTINA_A, MIEMBRO_A)).toBeNull();
    expect(prisma.rutina.findFirst).toHaveBeenCalledTimes(2);
    expect(prisma.rutina.findFirst).toHaveBeenLastCalledWith({ where: { id: RUTINA_A, miembroId: MIEMBRO_A },
      select: { id: true, nombre: true, objetivo: true, fechaInicio: true,
        entrenador: { select: { id: true, nombre: true, apellido: true } },
        dias: { orderBy: { orden: 'asc' }, select: { id: true, orden: true, nombre: true,
          ejercicios: { orderBy: { orden: 'asc' }, select: { id: true, orden: true, nombre: true, series: true, repeticiones: true, descansoSeg: true } },
        } },
      },
    });
  });
});
