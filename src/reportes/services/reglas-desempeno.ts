import type { FilaDesempenoDto } from '@Reportes/dto';
import type { EntrenadorDelReporte, FilaOcupacion, ResenasDeEntrenador } from '@Reportes/repositories';
import { calcularOcupacion, redondear1 } from './reglas-reporte.js';

/** Reseñas mínimas para publicar un promedio: el mismo umbral de H21. */
export const MINIMO_RESENAS_DESEMPENO = 3;

/**
 * Une, por entrenador, la ocupación de H26, las sesiones realizadas (H19) y
 * las reseñas (H21). Es una función pura.
 *
 * - Clases impartidas y ocupación salen de las filas de H26 (por tipo de clase
 *   y entrenador): se suman las reservas y el cupo de todas sus clases y se
 *   aplica la misma fórmula, calcularOcupacion(). Sin clases, null.
 * - Calificación: promedio con un decimal, o null con menos de 3 reseñas.
 */
export function armarDesempeno(
    entrenadores: EntrenadorDelReporte[],
    ocupacion: FilaOcupacion[],
    sesiones: ReadonlyMap<string, number>,
    resenas: ReadonlyMap<string, ResenasDeEntrenador>,
): FilaDesempenoDto[] {
    return entrenadores.map((entrenador) => {
        const suyas = ocupacion.filter((f) => f.entrenadorId === entrenador.id);
        const clasesImpartidas = suyas.reduce((suma, f) => suma + f.vecesImpartida, 0);
        const reservas = suyas.reduce((suma, f) => suma + f.reservasConfirmadas, 0);
        const cupo = suyas.reduce((suma, f) => suma + f.cupoTotal, 0);
        const resena = resenas.get(entrenador.id);
        const total = resena?.total ?? 0;

        return {
            entrenador,
            clasesImpartidas,
            ocupacionPromedio: clasesImpartidas > 0 ? calcularOcupacion(reservas, cupo) : null,
            sesionesRealizadas: sesiones.get(entrenador.id) ?? 0,
            calificacion:
                total >= MINIMO_RESENAS_DESEMPENO && resena?.promedio != null ? redondear1(resena.promedio) : null,
            resenas: total,
        };
    });
}
