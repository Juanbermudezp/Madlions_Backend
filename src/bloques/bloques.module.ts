import { Module } from '@nestjs/common';
import { BloquesController } from '@Bloques/controllers';
import { BloquesService } from '@Bloques/services';
import { BloqueRepository } from '@Bloques/repositories';

@Module({
    controllers: [BloquesController],
    providers: [BloquesService, BloqueRepository],
    exports: [BloquesService, BloqueRepository],
})
export class BloquesModule { }