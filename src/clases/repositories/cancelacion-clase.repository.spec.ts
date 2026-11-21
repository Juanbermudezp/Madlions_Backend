import type { PrismaService } from '@Prisma/services';
import { ClaseNoCancelableError } from '@Clases/errors';
import { ClaseRepository } from './clase.repository.js';
import { AHORA_H7, capturaH7, claseH7, idH7, MOTIVO_H7 } from '../../../test/qa/h7-fixtures.js';

describe('H7 ClaseRepository.cancelar (Prisma simulado)', () => {
    const tx = { clase: { updateMany: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn() }, $queryRaw: vi.fn() };
    const prisma = { $transaction: vi.fn() };
    const repo = new ClaseRepository(prisma as unknown as PrismaService);
    beforeEach(() => {
        vi.resetAllMocks(); prisma.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx));
        tx.clase.updateMany.mockResolvedValue({ count: 1 }); tx.clase.findUniqueOrThrow.mockResolvedValue(claseH7());
        tx.$queryRaw.mockResolvedValue(capturaH7().reservas);
    });
    const cancelar = () => repo.cancelar(idH7(10), MOTIVO_H7, idH7(1), AHORA_H7);
    it('una transacción ReadCommitted, guardia futura/programada y auditoría atómica', async () => {
        expect(await cancelar()).toEqual(capturaH7());
        expect(prisma.$transaction).toHaveBeenCalledExactlyOnceWith(expect.any(Function), { isolationLevel: 'ReadCommitted' });
        expect(tx.clase.updateMany).toHaveBeenCalledWith({ where: { id: idH7(10), estado: 'PROGRAMADA', inicio: { gt: AHORA_H7 } },
            data: { estado: 'CANCELADA_GIMNASIO', motivoCancelacion: MOTIVO_H7, canceladaEn: AHORA_H7, canceladaPorId: idH7(1) } });
        expect(tx.clase.updateMany.mock.invocationCallOrder[0]).toBeLessThan(tx.clase.findUniqueOrThrow.mock.invocationCallOrder[0]!);
        expect(tx.clase.findUniqueOrThrow.mock.invocationCallOrder[0]).toBeLessThan(tx.$queryRaw.mock.invocationCallOrder[0]!);
    });
    it('UPDATE RETURNING solo confirmadas de esa clase, SET histórico y parámetros seguros', async () => {
        await cancelar(); const [plantilla, ...parametros] = tx.$queryRaw.mock.calls[0]!; const sql = plantilla.join('?');
        expect(parametros).toEqual([AHORA_H7, idH7(10)]);
        for (const fragmento of ["SET estado = 'CANCELADA_GIMNASIO', cancelada_en = ?", "r.clase_id = ?::uuid AND r.estado = 'CONFIRMADA'",
            'm.id = r.membresia_id', 'RETURNING r.id AS "reservaId", r.miembro_id AS "miembroId"', "(m.tipo_plan = 'SET_CLASES') AS \"creditoDevuelto\""]) expect(sql).toContain(fragmento);
        expect(sql).not.toMatch(/UPDATE membresia|cantidad_clases\s*=|credito.*\+|FROM plan\b|CANCELADA_MIEMBRO/);
    });
    it.each([[null, 'NO_EXISTE'], [{ estado: 'CANCELADA_GIMNASIO' }, 'CANCELADA'], [{ estado: 'PROGRAMADA' }, 'INICIADA']] as const)('actualización0 clasifica%j como%s sin tocar reservas', async (actual, motivo) => {
        tx.clase.updateMany.mockResolvedValue({ count: 0 }); tx.clase.findUnique.mockResolvedValue(actual);
        await expect(cancelar()).rejects.toEqual(new ClaseNoCancelableError(motivo));
        expect(tx.$queryRaw).not.toHaveBeenCalled(); expect(tx.clase.findUniqueOrThrow).not.toHaveBeenCalled();
    });
    it('fallo en reservas se propaga para rollback del padre y no oculta errores', async () => {
        tx.$queryRaw.mockRejectedValue(new Error('actualización falló'));
        await expect(cancelar()).rejects.toThrow('actualización falló');
    });
});
