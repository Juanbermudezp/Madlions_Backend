import { Module } from '@nestjs/common';
import { CobrosController } from '@Cobros/controllers';
import { CobroRepository } from '@Cobros/repositories';
import { CobrosService } from '@Cobros/services';

/**
 * Cobros (Módulo 5). CobrosService.crearCobro() genera el cobro PENDIENTE que
 * piden membresías (H2) y sesiones (H9); el miembro consulta los suyos en
 * GET /cobros/mios y los paga (H12).
 */
@Module({
    controllers: [CobrosController],
    providers: [CobrosService, CobroRepository],
    exports: [CobrosService],
})
export class CobrosModule {}
