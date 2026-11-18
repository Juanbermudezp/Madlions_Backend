import { Module } from '@nestjs/common';
import { MembresiasModule } from '@Membresias';
import { MiembrosController } from '@Miembros/controllers';
import { MiembrosService } from '@Miembros/services';
import { MiembroRepository } from '@Miembros/repositories';
import { RutinasModule } from '../rutinas/index.js';
import { ProgresoModule } from '../progreso/index.js';
import { MiembroProgresoService } from './services/miembro-progreso.service.js';

/**
 * Miembros del gimnasio. La búsqueda la usan recepción (H2, H10) y el
 * entrenador (H14); el estado de la membresía sale de MembresiasModule.
 */
@Module({
    imports: [MembresiasModule, RutinasModule, ProgresoModule],
    controllers: [MiembrosController],
    providers: [MiembrosService, MiembroRepository, MiembroProgresoService],
    exports: [MiembrosService, MiembroRepository],
})
export class MiembrosModule {}
