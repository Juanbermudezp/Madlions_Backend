import { Injectable } from '@nestjs/common';
import type { ReporteDesempenoResponseDto } from '@Reportes/dto';
import { ReportesDesempenoRepository, ReportesRepository } from '@Reportes/repositories';
import { Rol, type User } from '@PrismaClient';
import { armarDesempeno } from './reglas-desempeno.js';
import { ReportesService } from './reportes.service.js';

/**
 * Reporte de desempeño de entrenadores (H29, BE-29.1).
 *
 * Combina, por entrenador y rango, las clases impartidas y su ocupación (H26),
 * las sesiones personales realizadas (H19) y las reseñas (H21).
 */
@Injectable()
export class ReportesDesempenoService {
    constructor(
        private readonly reportes: ReportesService,
        private readonly reportesRepository: ReportesRepository,
        private readonly repo: ReportesDesempenoRepository,
    ) { }

    /**
     * Si quien consulta es ENTRENADOR, siempre se usan sus propios datos y se
     * ignora `entrenadorId` (criterio 5). El administrador ve a todos, o solo
     * al de `entrenadorId`.
     *
     * @throws {BadRequestException} si el rango no es válido (reglas de H26).
     */
    async desempeno(
        usuario: Pick<User, 'id' | 'rol'>,
        consulta: { desde?: string; hasta?: string; entrenadorId?: string },
        ahora: Date = new Date(),
    ): Promise<ReporteDesempenoResponseDto> {
        const rango = this.reportes.rango(consulta.desde, consulta.hasta, ahora);
        const entrenadorId = usuario.rol === Rol.ENTRENADOR ? usuario.id : consulta.entrenadorId;

        const [entrenadores, ocupacion, sesiones, resenas] = await Promise.all([
            this.repo.entrenadores(entrenadorId),
            this.reportesRepository.ocupacionPorTipoYEntrenador(rango.inicio, rango.fin, ahora),
            this.repo.sesionesRealizadas(rango.inicio, rango.fin, ahora),
            this.repo.resenas(rango.inicio, rango.fin),
        ]);

        return {
            desde: rango.desde,
            hasta: rango.hasta,
            filas: armarDesempeno(entrenadores, ocupacion, sesiones, resenas),
        };
    }
}
