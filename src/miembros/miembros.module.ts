import { Module } from '@nestjs/common';
import { MembresiasModule } from '@Membresias';
import { MiembrosController } from '@Miembros/controllers';
import { MiembrosService } from '@Miembros/services';
import { MiembroRepository } from '@Miembros/repositories';

/**
 * Miembros del gimnasio. La búsqueda la usan recepción (H2, H10) y el
 * entrenador (H14); el estado de la membresía sale de MembresiasModule.
 */
@Module({
    imports: [MembresiasModule],
    controllers: [MiembrosController],
    providers: [MiembrosService, MiembroRepository],
    exports: [MiembrosService, MiembroRepository],
})
export class MiembrosModule {}
