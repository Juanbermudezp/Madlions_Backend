import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ClaseRepository, type CancelacionClaseConfirmada } from '@Clases/repositories';
import { ClaseNoCancelableError } from '@Clases/errors';
import { EstadoClase } from '@PrismaClient';
import type { ClaseCanceladaResponseDto } from '@Clases/dto';
import { AvisosClaseService, type MiembroAfectado } from '@Avisos/services';

@Injectable()
export class CancelacionClaseService {
    private readonly logger = new Logger(CancelacionClaseService.name);
    constructor(private readonly claseRepository: ClaseRepository, private readonly avisosClaseService: AvisosClaseService) {}

    async cancelar(id: string, motivo: string, administradorId: string, ahora: Date = new Date()): Promise<ClaseCanceladaResponseDto> {
        let resultado: CancelacionClaseConfirmada;
        try { resultado = await this.claseRepository.cancelar(id, motivo, administradorId, ahora); }
        catch (error) {
            if (error instanceof ClaseNoCancelableError) {
                if (error.motivo === 'NO_EXISTE') throw new NotFoundException('La clase no existe.');
                throw new ConflictException(error.motivo === 'CANCELADA' ? 'La clase ya está cancelada.' : 'No se puede cancelar una clase que ya empezó o terminó.');
            }
            throw error;
        }
        // $transaction solo resuelve tras commit. Nunca enviamos antes.
        const afectados: MiembroAfectado[] = resultado.reservas.map((r) => ({
            miembroId: r.miembroId,
            devolvioCredito: r.creditoDevuelto,
        }));
        try { await this.avisosClaseService.avisarCancelacion(resultado.clase.id, afectados, motivo); }
        catch (error) {
            this.logger.error(`Falló la notificación de la clase ${id}; la cancelación sigue confirmada.`,
                error instanceof Error ? error.stack : String(error));
        }
        return { id: resultado.clase.id, estado: EstadoClase.CANCELADA_GIMNASIO, reservasCanceladas: resultado.reservas.length };
    }
}
