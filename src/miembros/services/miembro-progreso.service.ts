import { ForbiddenException, Injectable } from '@nestjs/common';
import { RutinaRepository } from '../../rutinas/repositories/index.js';
import { ProgresoService } from '../../progreso/services/progreso.service.js';
import type { ProgresoQueryDto } from '../../progreso/dto/index.js';

/** BE-14.2: solo lectura, tras comprobar la relación entrenador-miembro (S14). */
@Injectable()
export class MiembroProgresoService {
  constructor(
    private readonly rutinas: RutinaRepository,
    private readonly progreso: ProgresoService,
  ) {}

  async consultar(entrenadorId: string, miembroId: string, query: ProgresoQueryDto) {
    if (!(await this.rutinas.tieneAsignacion(entrenadorId, miembroId))) {
      throw new ForbiddenException('No tienes una rutina asignada a este miembro.');
    }
    return this.progreso.listarPorMiembro(miembroId, query);
  }
}
