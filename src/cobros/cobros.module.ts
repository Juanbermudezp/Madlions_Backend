import { Module } from '@nestjs/common';
import { CobrosController, ComprobantesController } from '@Cobros/controllers';
import { CobroRepository, ComprobanteRepository } from '@Cobros/repositories';
import {
    CobrosService,
    ComprobantesService,
    PagosService,
    PasarelaSimuladaService,
} from '@Cobros/services';

/**
 * Cobros (Módulo 5). CobrosService.crearCobro() genera el cobro PENDIENTE que
 * piden membresías (H2) y sesiones (H9); el miembro consulta los suyos en
 * GET /cobros/mios y los paga (H12).
 */
@Module({
    controllers: [CobrosController, ComprobantesController],
    providers: [
        CobrosService,
        CobroRepository,
        PagosService,
        PasarelaSimuladaService,
        ComprobantesService,
        ComprobanteRepository,
    ],
    exports: [CobrosService],
})
export class CobrosModule {}
