import { Module } from '@nestjs/common';
import { AvisoVencimientoRepository } from '@Avisos/repositories';
import { AvisosVencimientoService } from '@Avisos/services';
import { MembresiasModule } from '@Membresias';
import { AvisosModule } from './avisos.module.js';

/**
 * Módulo 9 · Tarea diaria de avisos de vencimiento (H24).
 *
 * Está separada de AvisosModule porque necesita el estado de membresía
 * (MembresiasModule → PlanesModule → ClasesModule). Si AvisosModule lo
 * importara, ClasesModule no podría importar AvisosModule para la cancelación
 * de clases (H7/H25) sin crear una dependencia circular.
 */
@Module({
  imports: [AvisosModule, MembresiasModule],
  providers: [AvisosVencimientoService, AvisoVencimientoRepository],
})
export class AvisosVencimientoModule {}
