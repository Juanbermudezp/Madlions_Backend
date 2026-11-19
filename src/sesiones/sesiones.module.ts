import { Module } from '@nestjs/common';
import { BloquesModule } from '@Bloques';
import { CobrosModule } from '@Cobros';
import { ConfiguracionModule } from '@Configuracion';
import { MembresiasModule } from '@Membresias';
import { SesionesController } from '@Sesiones/controllers';
import { SesionRepository } from '@Sesiones/repositories';
import { SesionesService } from '@Sesiones/services';

/**
 * Sesiones personales (H9). Usa EstadoMembresiaService (Módulo 1) para la
 * membresía, ConfiguracionService (H1) para el precio y CobrosService
 * (Módulo 5) para generar el cobro dentro de la misma transacción.
 */
@Module({
    imports: [BloquesModule, CobrosModule, ConfiguracionModule, MembresiasModule],
    controllers: [SesionesController],
    providers: [SesionesService, SesionRepository],
    exports: [SesionesService, SesionRepository],
})
export class SesionesModule { }