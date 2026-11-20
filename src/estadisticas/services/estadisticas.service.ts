import { BadRequestException, Injectable } from '@nestjs/common';
import { aFechaLocal, sumarDias } from '@Common/fechas';
import { resolverRango } from '@Reportes/services';
import { CalificacionesRepository } from '@Estadisticas/repositories';
import type {
    CalificacionesResponseDto,
    PromedioCalificacionDto,
} from '@Estadisticas/dto';
import type { AgregadoCalificacion } from '@Estadisticas/repositories';
import { promedioPublicable } from './reglas-calificaciones.js';

// Estadísticas de calificaciones para la administración (H21).

@Injectable()
export class EstadisticasService {
    constructor(private readonly calificacionesRepository: CalificacionesRepository) { }

    /**
     * H21 · Promedio y total de reseñas por entrenador, por tipo de clase y de
     * las instalaciones. Sin rango, los últimos 30 días.
     *
     * El rango se valida y se convierte igual que en los reportes del Módulo
     * 10 (H26), para que las dos pantallas se comporten igual.
     *
     * @throws {BadRequestException} si el rango no es válido.
     */
    async calificaciones(
        desde: string | undefined,
        hasta: string | undefined,
        ahora: Date = new Date(),
    ): Promise<CalificacionesResponseDto> {
        const rango = resolverRango(desde, hasta, ahora);
        if ('error' in rango) throw new BadRequestException(rango.error);

        // Los días de El Salvador como instantes: [desde 00:00, hasta + 1 día 00:00).
        const inicio = aFechaLocal(rango.desde, '00:00');
        const fin = aFechaLocal(sumarDias(rango.hasta, 1), '00:00');

        const [entrenadores, tiposClase, instalaciones] = await Promise.all([
            this.calificacionesRepository.porEntrenador(inicio, fin),
            this.calificacionesRepository.porTipoClase(inicio, fin),
            this.calificacionesRepository.instalaciones(inicio, fin),
        ]);

        return {
            desde: rango.desde,
            hasta: rango.hasta,
            entrenadores: entrenadores.map(publicar),
            tiposClase: tiposClase.map(publicar),
            instalaciones: {
                promedio: promedioPublicable(instalaciones.promedio, instalaciones.total),
                total: instalaciones.total,
            },
        };
    }
}

function publicar(agregado: AgregadoCalificacion): PromedioCalificacionDto {
    return {
        id: agregado.id,
        nombre: agregado.nombre,
        promedio: promedioPublicable(agregado.promedio, agregado.total),
        total: agregado.total,
    };
}
