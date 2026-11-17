import { esFechaValida, hoyLocal, lunesDe, sumarDias } from '@Common/fechas';

export const MENSAJES_RESERVA = {
    semanaInvalida: 'La semana no es una fecha válida.',
    semanaFueraDeRango: 'Solo puedes consultar las clases de esta semana o de la siguiente.',
} as const;

/** Pestañas de "Mis reservas" (FE-5.2). */
export const PESTANAS_RESERVAS = ['proximas', 'pasadas'] as const;
export type PestanaReservas = (typeof PESTANAS_RESERVAS)[number];

/**
 * Lunes de la semana que el miembro puede consultar para reservar (BE-5.1).
 * Solo se permiten la semana actual y la siguiente, en hora de El Salvador.
 * Sin `semana`, devuelve la semana actual.
 *
 * @returns el lunes (AAAA-MM-DD) o el motivo del rechazo.
 */
export function semanaReservable(
    semana: string | undefined,
    ahora: Date,
): { lunes: string } | { error: string } {
    const lunesActual = lunesDe(hoyLocal(ahora));
    if (semana === undefined) return { lunes: lunesActual };
    if (!esFechaValida(semana)) return { error: MENSAJES_RESERVA.semanaInvalida };

    const lunes = lunesDe(semana);
    if (lunes !== lunesActual && lunes !== sumarDias(lunesActual, 7)) {
        return { error: MENSAJES_RESERVA.semanaFueraDeRango };
    }
    return { lunes };
}
