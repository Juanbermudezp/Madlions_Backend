/** Horas después del fin en las que todavía se puede registrar asistencia. */
export const VENTANA_HORAS = 24;

const VENTANA_MS = VENTANA_HORAS * 60 * 60 * 1000;

export const FUERA_DE_VENTANA =
    'La asistencia solo se registra desde el inicio hasta 24 horas después del fin.';

/**
 * La ventana de registro: desde que la actividad empieza hasta 24 horas
 * después de que termina, con los dos extremos incluidos (H19, criterio 5).
 */
export function dentroDeLaVentana(inicio: Date, fin: Date, ahora: Date): boolean {
    return ahora.getTime() >= inicio.getTime() && ahora.getTime() <= fin.getTime() + VENTANA_MS;
}

/** Instante desde el que una actividad ya no admite registro: `fin` + 24 h. */
export function limiteDeLaVentana(fin: Date): Date {
    return new Date(fin.getTime() + VENTANA_MS);
}

/**
 * Las actividades que se listan son las que empezaron y siguen dentro de la
 * ventana: `inicio <= ahora` y `fin >= ahora - 24 h`.
 */
export function finMinimoParaListar(ahora: Date): Date {
    return new Date(ahora.getTime() - VENTANA_MS);
}
