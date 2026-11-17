import { Module } from '@nestjs/common';
import { PrismaModule } from '@Prisma';
import { RutinasController } from './controllers/index.js';
import { RutinasService } from './services/index.js';
import { RutinaRepository } from './repositories/index.js';

@Module({ imports: [PrismaModule], controllers: [RutinasController], providers: [RutinasService, RutinaRepository] })
export class RutinasModule {}
