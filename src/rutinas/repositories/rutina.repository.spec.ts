import type { PrismaService } from '@Prisma/services';
import { RutinaRepository, type DatosRutina } from './rutina.repository.js';

const datos = { nombre: 'Fuerza', objetivo: 'Mejorar', fechaInicio: new Date('2026-11-18T00:00:00Z'),
  dias: [{ nombre: 'Primer día', ejercicios: [
    { nombre: 'Press', series: 4, repeticiones: 8, descansoSeg: 120 },
    { nombre: 'Remo', series: 3, repeticiones: 10, descansoSeg: 60 },
  ] }, { nombre: 'Segundo día', ejercicios: [{ nombre: 'Sentadilla', series: 4, repeticiones: 8, descansoSeg: 120 }] }],
} satisfies DatosRutina;

describe('RutinaRepository sin PostgreSQL', () => {
  const prisma = { $transaction: vi.fn(), rutina: { findMany: vi.fn(), findUnique: vi.fn() }, miembro: { findUnique: vi.fn() } };
  const tx = { rutina: { create: vi.fn(), update: vi.fn() }, rutinaDia: { deleteMany: vi.fn() } };
  const repo = new RutinaRepository(prisma as unknown as PrismaService);
  beforeEach(() => {
    vi.resetAllMocks();
    // Solo simula el límite transaccional: no abre conexiones.
    prisma.$transaction.mockImplementation((operar: (cliente: typeof tx) => Promise<unknown>) => operar(tx));
    tx.rutina.update.mockResolvedValue({ id: 'r1' });
    tx.rutina.create.mockResolvedValue({ id: 'r1' });
    tx.rutinaDia.deleteMany.mockResolvedValue({ count: 2 });
  });

  it('crea varios días/ejercicios atómicamente con orden generado desde 1', async () => {
    await repo.crear('e1', 'm1', datos);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    const guardado = tx.rutina.create.mock.calls[0]![0];
    expect(guardado.data).toMatchObject({ miembro: { connect: { id: 'm1' } }, entrenador: { connect: { id: 'e1' } } });
    expect(guardado.data.dias.create.map((d: { orden: number }) => d.orden)).toEqual([1, 2]);
    expect(guardado.data.dias.create[0].ejercicios.create).toEqual([
      { ...datos.dias[0]!.ejercicios[0], orden: 1 }, { ...datos.dias[0]!.ejercicios[1], orden: 2 },
    ]);
    expect(guardado.data.dias.create[1].ejercicios.create[0].orden).toBe(1);
  });

  it('consulta con dueño obligatorio, filtro opcional y orden explícito en relaciones', async () => {
    await repo.listar('e1', 'm2');
    expect(prisma.rutina.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { entrenadorId: 'e1', miembroId: 'm2' },
      include: expect.objectContaining({ dias: { orderBy: { orden: 'asc' }, include: { ejercicios: { orderBy: { orden: 'asc' } } } } }),
    }));
    const consulta = prisma.rutina.findMany.mock.calls[0]![0];
    expect(consulta.include.miembro.select).toEqual({ id: true, codigoMiembro: true, usuario: { select: { nombre: true, apellido: true } } });
    await repo.listar('e1');
    expect(prisma.rutina.findMany.mock.calls[1]![0].where).toEqual({ entrenadorId: 'e1' });
  });

  it('bloquea el padre, borra días y recrea relaciones en una transacción sin transferir propietarios', async () => {
    await repo.reemplazar('r1', 'e1', datos);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.rutina.update.mock.calls[0]![0]).toEqual({ where: { id: 'r1', entrenadorId: 'e1' },
      data: { nombre: datos.nombre, objetivo: datos.objetivo, fechaInicio: datos.fechaInicio } });
    expect(tx.rutinaDia.deleteMany).toHaveBeenCalledWith({ where: { rutinaId: 'r1', rutina: { entrenadorId: 'e1' } } });
    expect(tx.rutina.update.mock.invocationCallOrder[0]).toBeLessThan(tx.rutinaDia.deleteMany.mock.invocationCallOrder[0]!);
    expect(tx.rutinaDia.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(tx.rutina.update.mock.invocationCallOrder[1]!);
    const reemplazo = tx.rutina.update.mock.calls[1]![0];
    expect(reemplazo.where).toEqual({ id: 'r1', entrenadorId: 'e1' });
    expect(reemplazo.data.dias.create.map((d: { orden: number }) => d.orden)).toEqual([1, 2]);
    for (const [operacion] of tx.rutina.update.mock.calls) {
      for (const inmutable of ['miembroId', 'entrenadorId', 'id', 'creadoEn']) {
        expect(operacion.data).not.toHaveProperty(inmutable);
      }
    }
  });

  it.each(['actualizar-padre', 'borrar-dias', 'crear-dias'])('aborta la transacción si falla %s (rollback simulado)', async (paso) => {
    // Emula una transacción con copia de trabajo y commit solo si el callback
    // termina. Comprueba que el repositorio no absorba errores ni escriba fuera.
    let confirmado = { nombre: 'Anterior', dias: ['día anterior'] };
    const anterior = structuredClone(confirmado);
    const fallo = new Error(paso);
    prisma.$transaction.mockImplementation(async (operar: (cliente: typeof tx) => Promise<unknown>) => {
      const trabajo = structuredClone(confirmado);
      tx.rutina.update.mockImplementationOnce(async () => {
        if (paso === 'actualizar-padre') throw fallo;
        trabajo.nombre = datos.nombre;
        return { id: 'r1' };
      }).mockImplementationOnce(async () => {
        if (paso === 'crear-dias') throw fallo;
        trabajo.dias = ['nuevo'];
        return { id: 'r1' };
      });
      tx.rutinaDia.deleteMany.mockImplementation(async () => {
        if (paso === 'borrar-dias') throw fallo;
        trabajo.dias = [];
        return { count: 1 };
      });
      const resultado = await operar(tx);
      confirmado = trabajo;
      return resultado;
    });
    await expect(repo.reemplazar('r1', 'e1', datos)).rejects.toBe(fallo);
    expect(confirmado).toEqual(anterior);
    expect(prisma.rutina.findMany).not.toHaveBeenCalled();
  });
});
