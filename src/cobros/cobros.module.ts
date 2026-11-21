import { Module } from '@nestjs/common';
import { CobrosAdminController, CobrosController, ComprobantesController } from '@Cobros/controllers';
import { CobroAdminRepository, CobroRepository, ComprobanteRepository } from '@Cobros/repositories';
import {
    CobrosAdminService,
    CobrosService,
    ComprobantesService,
    PagosService,
    PasarelaSimuladaService,
} from '@Cobros/services';

/**
 * Cobros (Módulo 5). CobrosService.crearCobro() genera el cobro PENDIENTE que
 * piden membresías (H2) y sesiones (H9); el miembro consulta los suyos en
 * GET /cobros/mios y los paga (H12). El administrador consulta todos en
 * GET /cobros (H13).
 */
@Module({
    controllers: [CobrosController, ComprobantesController, CobrosAdminController],
    providers: [
        CobrosService,
        CobroRepository,
        PagosService,
        PasarelaSimuladaService,
        ComprobantesService,
        ComprobanteRepository,
        CobrosAdminService,
        CobroAdminRepository,
    ],
    exports: [CobrosService],
})
export class CobrosModule {}