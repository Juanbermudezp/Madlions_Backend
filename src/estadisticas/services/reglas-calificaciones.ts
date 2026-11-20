import { redondear1 } from '@Reportes/services';

/** Reseñas mínimas para publicar un promedio (H21, criterio 3). */
export const MINIMO_RESENAS = 3;

/**
 * Promedio con un decimal, o null cuando no hay reseñas suficientes: con dos
 * o menos la pantalla muestra "Sin datos suficientes" en vez de un número que
 * no dice nada.
 *
 * `total` es cuántas reseñas calificaron **ese** aspecto: una reseña que omitió
 * al entrenador no cuenta ni en su promedio ni en su total (criterio técnico
 * de BE-21.1).
 */
export function promedioPublicable(promedio: number | null, total: number): number | null {
    if (total < MINIMO_RESENAS || promedio === null) return null;
    return redondear1(promedio);
}
