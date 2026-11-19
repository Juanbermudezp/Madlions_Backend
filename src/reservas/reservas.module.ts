import { Module } from '@nestjs/common';
import { AvisosModule } from '@Avisos';
import { ClasesModule } from '@Clases';
import { MembresiasModule } from '@Membresias';
import { ClasesReservablesController, ReservasController } from '@Reservas/controllers';
import { ReservaRepository } from '@Reservas/repositories';
import { ReservasService } from '@Reservas/services';

/**
 * Reservas de clases grupales (H5). Usa ClaseRepository (H4) para las clases
 * de la semana, EstadoMembresiaService (H2) para validar la membresía y
 * AvisosService (H22) para el aviso "Reserva confirmada".
 */
@Module({
    imports: [ClasesModule, MembresiasModule, AvisosModule],
    controllers: [ClasesReservablesController, ReservasController],
    providers: [ReservasService, ReservaRepository],
    exports: [ReservasService, ReservaRepository],
})
export class ReservasModule { }
