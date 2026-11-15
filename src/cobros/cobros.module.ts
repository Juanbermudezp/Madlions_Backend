import { Module } from '@nestjs/common';
import { CobroRepository } from '@Cobros/repositories';
import { CobrosService } from '@Cobros/services';

/**
 * Cobros (Módulo 5). Base creada por H2: CobrosService.crearCobro() genera el
 * cobro PENDIENTE que el miembro paga desde su cuenta. La historia de pagos
 * agrega aquí la confirmación y la consulta.
 */
@Module({
    providers: [CobrosService, CobroRepository],
    exports: [CobrosService],
})
export class CobrosModule {}
