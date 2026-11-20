import { Module } from '@nestjs/common';
import { EstadisticasController } from '@Estadisticas/controllers';
import { EstadisticasService } from '@Estadisticas/services';
import { CalificacionesRepository } from '@Estadisticas/repositories';

// Estadísticas de calificaciones (H21). Reutiliza las reglas de rango del
// Módulo 10, para que este panel y los reportes se comporten igual.
@Module({
    controllers: [EstadisticasController],
    providers: [EstadisticasService, CalificacionesRepository],
    exports: [EstadisticasService],
})
export class EstadisticasModule {}
