import { Module } from '@nestjs/common';
import { PrismaModule } from '@Prisma';
import { RutinasController, RutinasMiembroController } from './controllers/index.js';
import { RutinasService, RutinasMiembroService } from './services/index.js';
import { RutinaRepository, RutinaMiembroRepository } from './repositories/index.js';

@Module({
  imports: [PrismaModule],
  controllers: [RutinasController, RutinasMiembroController],
  providers: [RutinasService, RutinaRepository, RutinasMiembroService, RutinaMiembroRepository],
  exports: [RutinaRepository],
})
export class RutinasModule {}
