import { Module } from '@nestjs/common';
import { ReportesController } from '@Reportes/controllers';
import { ReportesRepository } from '@Reportes/repositories';
import { ReportesService } from '@Reportes/services';

/**
 * Reportes y analítica para la administración (Módulo 10, H26 a H29).
 * Solo lee: no modifica las tablas de los demás módulos.
 */
@Module({
    controllers: [ReportesController],
    providers: [ReportesService, ReportesRepository],
    exports: [ReportesService, ReportesRepository],
})
export class ReportesModule { }
