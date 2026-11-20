/** Días que tiene el miembro para calificar después de la clase o sesión. */
export const PLAZO_DIAS = 7;

const PLAZO_MS = PLAZO_DIAS * 24 * 60 * 60 * 1000;

export const CALIFICA_AL_MENOS_UN_ASPECTO = 'Califica al menos un aspecto.';

/** Hasta cuándo se puede calificar: `fin` + 7 días. */
export function fechaLimite(fin: Date): Date {
    return new Date(fin.getTime() + PLAZO_MS);
}

/**
 * El plazo de 7 días, con el límite incluido (H20, criterio 5). Se cuenta
 * desde que termina la clase o la sesión, no desde que se marcó la asistencia.
 */
export function dentroDelPlazo(fin: Date, ahora: Date): boolean {
    return ahora.getTime() <= fechaLimite(fin).getTime();
}

/** Desde qué instante una actividad sigue siendo calificable. */
export function finMinimoParaCalificar(ahora: Date): Date {
    return new Date(ahora.getTime() - PLAZO_MS);
}

/** Se puede omitir cualquier aspecto, pero no los tres (criterio 4). */
export function hayAlgunaCalificacion(calificaciones: {
    calActividad?: number;
    calEntrenador?: number;
    calInstalaciones?: number;
}): boolean {
    return (
        calificaciones.calActividad !== undefined ||
        calificaciones.calEntrenador !== undefined ||
        calificaciones.calInstalaciones !== undefined
    );
}
