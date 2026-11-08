import { Module } from '@nestjs/common';
import { ProgresoController } from './controllers/progreso.controller.js';
import { ProgresoService } from './services/progreso.service.js';
import { ProgresoRepository } from './repositories/progreso.repository.js';

@Module({
  controllers: [ProgresoController],
  providers: [ProgresoService, ProgresoRepository],
  exports: [ProgresoService],
})
export class ProgresoModule {}
