import { Module } from '@nestjs/common';
import { ClasesController } from '@Clases/controllers';
import { ClasesService } from '@Clases/services';
import { ClaseRepository } from '@Clases/repositories';

@Module({
  controllers: [ClasesController],
  providers: [ClasesService, ClaseRepository],
  exports: [ClasesService, ClaseRepository],
})
export class ClasesModule {}