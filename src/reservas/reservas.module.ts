import { Module } from '@nestjs/common';
import { ClasesModule } from '@Clases';
import { ClasesReservablesController, ReservasController } from '@Reservas/controllers';
import { ReservaRepository } from '@Reservas/repositories';
import { ReservasService } from '@Reservas/services';

/**
 * Reservas de clases grupales (H5). Usa ClaseRepository (H4) para las clases
 * de la semana y el conteo de reservas confirmadas.
 */
@Module({
    imports: [ClasesModule],
    controllers: [ClasesReservablesController, ReservasController],
    providers: [ReservasService, ReservaRepository],
    exports: [ReservasService, ReservaRepository],
})
export class ReservasModule { }
