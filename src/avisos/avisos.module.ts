import { Module } from '@nestjs/common';
import { AvisosController } from '@Avisos/controllers';
import { AvisosBandejaService, AvisosService } from '@Avisos/services';
import { AvisoBandejaRepository, AvisoRepository } from '@Avisos/repositories';

/**
 * Módulo 9 · Notificaciones.
 *
 * - H22: exporta AvisosService. El módulo que necesite avisar lo importa en su
 *   propio @Module({ imports: [AvisosModule] }).
 * - H23: AvisosController expone la bandeja del miembro (solo lectura y
 *   marcado como leído). Ninguna ruta crea avisos.
 */
@Module({
  controllers: [AvisosController],
  providers: [
    AvisosService,
    AvisoRepository,
    AvisosBandejaService,
    AvisoBandejaRepository,
  ],
  exports: [AvisosService],
})
export class AvisosModule {}
