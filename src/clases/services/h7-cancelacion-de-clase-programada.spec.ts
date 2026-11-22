import { ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { PrismaService } from '@Prisma/services';
import type { AvisosClaseService } from '@Avisos/services';
import { ClaseNoCancelableError } from '@Clases/errors';
import { CancelarClaseDto } from '@Clases/dto';
import { EstadoClase, Rol } from '@PrismaClient';
import { rolesPermitidos } from '../../../test/helpers/roles.js';
import { AHORA_H7, capturaH7, claseH7, idH7, MOTIVO_H7 } from '../../../test/qa/h7-fixtures.js';
import { CancelacionClaseController } from '../controllers/cancelacion-clase.controller.js';
import { ClaseRepository } from '../repositories/clase.repository.js';
import { estadoVisible } from './reglas-clase.js';
import { CancelacionClaseService } from './cancelacion-clase.service.js';

describe('H7. Cancelación de una clase programada', () => {
    const tx = { clase: { updateMany: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn() }, $queryRaw: vi.fn() };
    const prisma = { $transaction: vi.fn() };
    const repo = new ClaseRepository(prisma as unknown as PrismaService);
    const avisos = { avisarCancelacion: vi.fn() };
    const servicio = new CancelacionClaseService(repo, avisos as unknown as AvisosClaseService);

    beforeEach(() => {
        vi.resetAllMocks();
        prisma.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx));
        tx.clase.updateMany.mockResolvedValue({ count: 1 });
        tx.clase.findUniqueOrThrow.mockResolvedValue(claseH7());
        tx.$queryRaw.mockResolvedValue(capturaH7().reservas);
        avisos.avisarCancelacion.mockResolvedValue({ creados: 3, omitidosPorDuplicado: 0, fallidos: 0 });
    });

    const cancelar = () => servicio.cancelar(idH7(10), MOTIVO_H7, idH7(1), AHORA_H7);
    const sqlDeReservas = () => {
        const [plantilla] = tx.$queryRaw.mock.calls[0]!;
        return (plantilla as string[]).join('?');
    };

    it('AC1: la clase pasa a "Cancelada por el gimnasio" con el motivo, la fecha y el administrador', async () => {
        await expect(cancelar()).resolves.toEqual({ id: idH7(10), estado: EstadoClase.CANCELADA_GIMNASIO, reservasCanceladas: 3 });

        expect(tx.clase.updateMany).toHaveBeenCalledWith({
            where: { id: idH7(10), estado: 'PROGRAMADA', inicio: { gt: AHORA_H7 } },
            data: { estado: 'CANCELADA_GIMNASIO', motivoCancelacion: MOTIVO_H7, canceladaEn: AHORA_H7, canceladaPorId: idH7(1) },
        });
    });

    it('AC2: las reservas confirmadas pasan a "Cancelada por el gimnasio" y la clase deja de ser reservable', async () => {
        await cancelar();

        const sql = sqlDeReservas();
        expect(sql).toContain("SET estado = 'CANCELADA_GIMNASIO'");
        expect(sql).toContain("r.estado = 'CONFIRMADA'");
        // "Clases de la semana" solo muestra clases PROGRAMADAS: una cancelada ya no aparece.
        expect(estadoVisible({ estado: EstadoClase.CANCELADA_GIMNASIO, fin: claseH7().fin }, AHORA_H7)).toBe('CANCELADA_GIMNASIO');
    });

    it('AC3: en un Set de clases el crédito se devuelve una sola vez', async () => {
        await cancelar();

        const sql = sqlDeReservas();
        // El crédito se libera porque la reserva deja de estar CONFIRMADA; no se suma nada a la membresía.
        expect(sql).toContain('"creditoDevuelto"');
        expect(sql).not.toMatch(/UPDATE membresia|cantidad_clases\s*=/);
        const afectados = avisos.avisarCancelacion.mock.calls[0]![1] as { devolvioCredito: boolean }[];
        expect(afectados.filter((a) => a.devolvioCredito)).toHaveLength(2);
    });

    it('AC4: después de guardar avisa a cada miembro con reserva confirmada (H25)', async () => {
        await cancelar();

        expect(avisos.avisarCancelacion).toHaveBeenCalledExactlyOnceWith(
            idH7(10),
            [
                { miembroId: idH7(21), devolvioCredito: true },
                { miembroId: idH7(22), devolvioCredito: false },
                { miembroId: idH7(23), devolvioCredito: true },
            ],
            MOTIVO_H7,
        );
        expect(prisma.$transaction.mock.invocationCallOrder[0]).toBeLessThan(avisos.avisarCancelacion.mock.invocationCallOrder[0]!);
    });

    it('AC5: una clase que ya empezó o terminó no se puede cancelar', async () => {
        tx.clase.updateMany.mockResolvedValue({ count: 0 });
        tx.clase.findUnique.mockResolvedValue({ estado: 'PROGRAMADA' });

        await expect(cancelar()).rejects.toThrow(new ConflictException('No se puede cancelar una clase que ya empezó o terminó.'));
        expect(avisos.avisarCancelacion).not.toHaveBeenCalled();
    });

    it('AC6: una clase ya cancelada no se cancela otra vez ni reenvía avisos', async () => {
        tx.clase.updateMany.mockResolvedValue({ count: 0 });
        tx.clase.findUnique.mockResolvedValue({ estado: 'CANCELADA_GIMNASIO' });

        await expect(repo.cancelar(idH7(10), MOTIVO_H7, idH7(1), AHORA_H7)).rejects.toEqual(new ClaseNoCancelableError('CANCELADA'));
        await expect(cancelar()).rejects.toThrow(new ConflictException('La clase ya fue cancelada'));
        expect(tx.$queryRaw).not.toHaveBeenCalled();
        expect(avisos.avisarCancelacion).not.toHaveBeenCalled();
    });

    it('AC7: el motivo vacío o con menos de 10 caracteres no se acepta', async () => {
        const errores = async (motivo: unknown) =>
            (await validate(plainToInstance(CancelarClaseDto, { motivo }), { whitelist: true, forbidNonWhitelisted: true }))
                .flatMap((e) => Object.values(e.constraints ?? {}));

        expect(await errores('')).toContain('El motivo debe tener de 10 a 250 caracteres.');
        expect(await errores('   corto   ')).toContain('El motivo debe tener de 10 a 250 caracteres.');
        expect(await errores('x'.repeat(251))).toContain('El motivo debe tener de 10 a 250 caracteres.');
        expect(await errores(MOTIVO_H7)).toEqual([]);
    });

    it('AC8: solo el administrador puede cancelar una clase', () => {
        expect(rolesPermitidos(CancelacionClaseController, 'cancelar')).toEqual([Rol.ADMINISTRADOR]);
    });
});
