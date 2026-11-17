import { Module } from '@nestjs/common';
import { MembresiasModule } from '@Membresias';
import { AccesosController } from '@Accesos/controllers';
import { RegistroAccesoRepository } from '@Accesos/repositories';
import { AccesosService } from '@Accesos/services';

/** Control de ingresos y salidas (H10). Usa EstadoMembresiaService (Módulo 1). */
@Module({
    imports: [MembresiasModule],
    controllers: [AccesosController],
    providers: [AccesosService, RegistroAccesoRepository],
    exports: [AccesosService, RegistroAccesoRepository],
})
export class AccesosModule { }