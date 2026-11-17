import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RegistroAccesoRepository } from '@Accesos/repositories';
import { ZONA_HORARIA, aFechaLocal, hoyLocal } from '@Common/fechas';

/** Todos los días a las 23:59. */
export const CRON_CIERRE_AUTOMATICO = '59 23 * * *';

/**
 * Cierre automático de ingresos (H10, BE-10.2).
 *
 * A las 23:59 en hora de El Salvador cierra los ingresos del día que siguen
 * DENTRO: quedan CERRADO_AUTO con salida a las 23:59 y sin usuario de salida.
 * Registra en el log cuántos cerró.
 */
@Injectable()
export class CierreAutomaticoService {
    private readonly logger = new Logger(CierreAutomaticoService.name);

    constructor(private readonly registroAccesoRepository: RegistroAccesoRepository) { }

    @Cron(CRON_CIERRE_AUTOMATICO, {
        name: 'cierre-automatico-accesos',
        timeZone: ZONA_HORARIA,
    })
    ejecutar(): Promise<number> {
        return this.cerrarIngresosDelDia(new Date());
    }

    /**
     * Cierra los ingresos abiertos del día de `ahora` (UTC-6). Recibe `ahora`
     * para poder probarlo con un reloj simulado.
     */
    async cerrarIngresosDelDia(ahora: Date): Promise<number> {
        const dia = hoyLocal(ahora);
        const cerrados = await this.registroAccesoRepository.cerrarAbiertosDelDia(
            aFechaLocal(dia, '00:00'),
            aFechaLocal(dia, '23:59'),
        );
        this.logger.log(`Cierre automático del ${dia}: ${cerrados} ingreso(s) cerrado(s).`);
        return cerrados;
    }
}