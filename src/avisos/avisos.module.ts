import { Module } from '@nestjs/common';
import { AvisosController } from '@Avisos/controllers';
import {
  AvisosBandejaService,
  AvisosClaseService,
  AvisosService,
} from '@Avisos/services';
import {
  AvisoBandejaRepository,
  AvisoClaseRepository,
  AvisoRepository,
} from '@Avisos/repositories';

/**
 * Módulo 9 · Notificaciones.
 *
 * - H22: exporta AvisosService. El módulo que necesite avisar lo importa en su
 *   propio @Module({ imports: [AvisosModule] }).
 * - H23: AvisosController expone la bandeja del miembro (solo lectura y
 *   marcado como leído). Ninguna ruta crea avisos.
 * - H25: exporta AvisosClaseService para que la cancelación de clases (BE-7.1)
 *   avise a los miembros afectados.
 *
 * No importa ningún otro módulo de negocio, para que cualquiera (incluido
 * ClasesModule) pueda importarlo sin dependencias circulares. La tarea de H24
 * vive aparte, en AvisosVencimientoModule, porque necesita MembresiasModule.
 */
@Module({
  controllers: [AvisosController],
  providers: [
    AvisosService,
    AvisoRepository,
    AvisosBandejaService,
    AvisoBandejaRepository,
    AvisosClaseService,
    AvisoClaseRepository,
  ],
  exports: [AvisosService, AvisosClaseService],
})
export class AvisosModule {}
