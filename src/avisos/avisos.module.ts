import { Module } from '@nestjs/common';
import { AvisosController } from '@Avisos/controllers';
import {
  AvisosBandejaService,
  AvisosService,
  AvisosVencimientoService,
} from '@Avisos/services';
import {
  AvisoBandejaRepository,
  AvisoRepository,
  AvisoVencimientoRepository,
} from '@Avisos/repositories';
import { MembresiasModule } from '@Membresias';

/**
 * Módulo 9 · Notificaciones.
 *
 * - H22: exporta AvisosService. El módulo que necesite avisar lo importa en su
 *   propio @Module({ imports: [AvisosModule] }).
 * - H23: AvisosController expone la bandeja del miembro (solo lectura y
 *   marcado como leído). Ninguna ruta crea avisos.
 * - H24: AvisosVencimientoService corre todos los días a las 06:00 y avisa a
 *   los miembros cuya membresía está próxima a vencer. Usa el estado de
 *   membresía de MembresiasModule (BE-2.4).
 */
@Module({
  imports: [MembresiasModule],
  controllers: [AvisosController],
  providers: [
    AvisosService,
    AvisoRepository,
    AvisosBandejaService,
    AvisoBandejaRepository,
    AvisosVencimientoService,
    AvisoVencimientoRepository,
  ],
  exports: [AvisosService],
})
export class AvisosModule {}
