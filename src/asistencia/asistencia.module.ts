import { Module } from '@nestjs/common';
import { AsistenciaController } from '@Asistencia/controllers';
import { AsistenciaService } from '@Asistencia/services';
import { AsistenciaRepository } from '@Asistencia/repositories';

// Registro de asistencia a clases y sesiones (H19). H20 lee la asistencia
// para saber qué puede calificar un miembro.
@Module({
    controllers: [AsistenciaController],
    providers: [AsistenciaService, AsistenciaRepository],
    exports: [AsistenciaService, AsistenciaRepository],
})
export class AsistenciaModule {}
