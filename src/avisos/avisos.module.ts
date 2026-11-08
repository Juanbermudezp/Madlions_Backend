import { Module } from '@nestjs/common';
import { AvisosService } from '@Avisos/services';
import { AvisoRepository } from '@Avisos/repositories';

/**
 * Módulo 9 · Notificaciones (H22).
 *
 * Solo exporta AvisosService: el módulo que necesite avisar lo importa en su
 * propio @Module({ imports: [AvisosModule] }). No tiene controladores.
 */
@Module({
  providers: [AvisosService, AvisoRepository],
  exports: [AvisosService],
})
export class AvisosModule {}
