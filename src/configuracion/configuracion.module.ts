import { Module } from '@nestjs/common';
import { ConfiguracionController } from '@Configuracion/controllers';
import { ConfiguracionService } from '@Configuracion/services';
import { ConfiguracionRepository } from '@Configuracion/repositories';

/**
 * Configuración general del sistema (H1). Exporta ConfiguracionService para
 * que otros módulos lean el precio de la clase puntual (BE-9.2, Módulo 3).
 */
@Module({
    controllers: [ConfiguracionController],
    providers: [ConfiguracionService, ConfiguracionRepository],
    exports: [ConfiguracionService],
})
export class ConfiguracionModule {}
