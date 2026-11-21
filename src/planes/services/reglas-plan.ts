import { TipoPlan } from '@PrismaClient';

export const CANTIDAD_CLASES_REQUERIDA =
    'Los planes SET_CLASES requieren cantidadClases entre 1 y 100.';
export const CANTIDAD_CLASES_NO_PERMITIDA =
    'Solo los planes SET_CLASES llevan cantidadClases.';

/** Duración del plan según su tipo: 1 día el DAYPASS y 30 días los demás. */
export function duracionDiasPorTipo(tipo: TipoPlan): number {
    return tipo === TipoPlan.DAYPASS ? 1 : 30;
}

/**
 * Revisa cantidadClases contra el tipo del plan (el rango 1-100 ya lo valida
 * el DTO). `undefined` significa que el campo no se envió.
 *
 * @returns el mensaje de error, o null si es válido.
 */
export function errorCantidadClases(
    tipo: TipoPlan,
    cantidadClases: number | null | undefined,
    esCreacion: boolean,
): string | null {
    if (tipo === TipoPlan.SET_CLASES) {
        const falta = cantidadClases === null || (esCreacion && cantidadClases === undefined);
        return falta ? CANTIDAD_CLASES_REQUERIDA : null;
    }
    return cantidadClases === undefined || cantidadClases === null
        ? null
        : CANTIDAD_CLASES_NO_PERMITIDA;
}
