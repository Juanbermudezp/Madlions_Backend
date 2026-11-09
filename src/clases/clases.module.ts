import { Module } from '@nestjs/common';
import { ClasesController, TiposClaseController } from '@Clases/controllers';
import { ClasesService, TiposClaseService } from '@Clases/services';
import { ClaseRepository, TipoClaseRepository } from '@Clases/repositories';

@Module({
  controllers: [ClasesController, TiposClaseController],
  providers: [ClasesService, ClaseRepository, TiposClaseService, TipoClaseRepository],
  exports: [ClasesService, ClaseRepository, TiposClaseService, TipoClaseRepository],
})
export class ClasesModule {}
