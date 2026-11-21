import { Module } from '@nestjs/common';
import { ResenasController } from '@Resenas/controllers';
import { ResenasService } from '@Resenas/services';
import { ResenaRepository } from '@Resenas/repositories';

// Reseñas de clases y sesiones (H20). H21 promedia lo que acá se guarda.
@Module({
    controllers: [ResenasController],
    providers: [ResenasService, ResenaRepository],
    exports: [ResenasService, ResenaRepository],
})
export class ResenasModule {}
