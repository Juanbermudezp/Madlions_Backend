import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import type { ClaseRepository, CancelacionClaseConfirmada } from '@Clases/repositories';
import { ClaseNoCancelableError } from '@Clases/errors';
import type { AvisosClaseService } from '@Avisos/services';
import { CancelacionClaseService } from './cancelacion-clase.service.js';
import { AHORA_H7, capturaH7, idH7, MOTIVO_H7 } from '../../../test/qa/h7-fixtures.js';

describe('H7 CancelacionClaseService', () => {
    const repo = { cancelar: vi.fn() };
    const avisos = { avisarCancelacion: vi.fn() };
    const servicio = new CancelacionClaseService(repo as unknown as ClaseRepository, avisos as unknown as AvisosClaseService);
    beforeEach(() => { vi.resetAllMocks(); repo.cancelar.mockResolvedValue(capturaH7()); avisos.avisarCancelacion.mockResolvedValue({ creados: 3, omitidosPorDuplicado: 0, fallidos: 0 }); });
    afterEach(() => vi.restoreAllMocks());
    it('respuesta exacta3, auditoría con actor servidor y envío después de resolver commit', async () => {
        let confirmar!: (r: CancelacionClaseConfirmada) => void;
        repo.cancelar.mockReturnValue(new Promise((r) => { confirmar = r; }));
        const pendiente = servicio.cancelar(idH7(10), MOTIVO_H7, idH7(1), AHORA_H7);
        expect(repo.cancelar).toHaveBeenCalledWith(idH7(10), MOTIVO_H7, idH7(1), AHORA_H7);
        expect(avisos.avisarCancelacion).not.toHaveBeenCalled();
        confirmar(capturaH7());
        expect(await pendiente).toEqual({ id: idH7(10), estado: 'CANCELADA_GIMNASIO', reservasCanceladas: 3 });
        expect(avisos.avisarCancelacion).toHaveBeenCalledExactlyOnceWith(idH7(10), [
            { miembroId: idH7(21), devolvioCredito: true },
            { miembroId: idH7(22), devolvioCredito: false },
            { miembroId: idH7(23), devolvioCredito: true },
        ], MOTIVO_H7);
    });
    it.each([['NO_EXISTE', NotFoundException], ['CANCELADA', ConflictException], ['INICIADA', ConflictException]] as const)('%s se traduce y no envía', async (motivo, tipo) => {
        repo.cancelar.mockRejectedValue(new ClaseNoCancelableError(motivo));
        await expect(servicio.cancelar(idH7(10), MOTIVO_H7, idH7(1), AHORA_H7)).rejects.toThrow(tipo);
        expect(avisos.avisarCancelacion).not.toHaveBeenCalled();
    });
    it('error transaccional/commit no notifica ni se convierte en éxito', async () => {
        repo.cancelar.mockRejectedValue(new Error('commit falló'));
        await expect(servicio.cancelar(idH7(10), MOTIVO_H7, idH7(1), AHORA_H7)).rejects.toThrow('commit falló');
        expect(avisos.avisarCancelacion).not.toHaveBeenCalled();
    });
    it('fallo inesperado del notificador registra Logger y mantiene200', async () => {
        const logger = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
        avisos.avisarCancelacion.mockRejectedValue(new Error('falló aviso'));
        expect(await servicio.cancelar(idH7(10), MOTIVO_H7, idH7(1), AHORA_H7)).toMatchObject({ reservasCanceladas: 3 });
        expect(logger).toHaveBeenCalledOnce(); expect(repo.cancelar).toHaveBeenCalledOnce();
    });
    it('solo adapta las reservas devueltas por la transacción, sin reconstruir destinatarios', async () => {
        const captura = capturaH7();
        captura.reservas = [captura.reservas[1]!];
        repo.cancelar.mockResolvedValue(captura);
        expect(await servicio.cancelar(idH7(10), MOTIVO_H7, idH7(1), AHORA_H7)).toMatchObject({ reservasCanceladas: 1 });
        expect(avisos.avisarCancelacion).toHaveBeenCalledExactlyOnceWith(idH7(10), [{ miembroId: idH7(22), devolvioCredito: false }], MOTIVO_H7);
    });
    it('H25 puede devolver fallidos sin convertir la cancelación confirmada en error', async () => {
        avisos.avisarCancelacion.mockResolvedValue({ creados: 0, omitidosPorDuplicado: 0, fallidos: 2 });
        expect(await servicio.cancelar(idH7(10), MOTIVO_H7, idH7(1), AHORA_H7))
            .toEqual({ id: idH7(10), estado: 'CANCELADA_GIMNASIO', reservasCanceladas: 3 });
        expect(repo.cancelar).toHaveBeenCalledOnce();
    });
});
