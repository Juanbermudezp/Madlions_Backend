import { aFechaLocal, esFechaValida, ZONA_HORARIA } from '@Common/fechas';
import { EstadoClase } from '@PrismaClient';

export const CUPO_MINIMO = 1;
export const CUPO_MAXIMO = 50;

/** Estado que ve el usuario: "Impartida" no se guarda, se calcula (S de estados). */
export const ESTADO_IMPARTIDA = 'IMPARTIDA';
export type EstadoVisibleClase = EstadoClase | typeof ESTADO_IMPARTIDA;

export interface HorarioClase {
    fecha: string;
    horaInicio: string;
    horaFin: string;
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Valida fecha y horas de una clase en hora de El Salvador.
 * Devuelve el motivo del rechazo o null si el horario es válido.
 */
export function validarHorarioClase(
    { fecha, horaInicio, horaFin }: HorarioClase,
    ahora: Date,
): string | null {
    if (!esFechaValida(fecha)) {
        return 'La fecha no es válida.';
    }
    if (!HORA.test(horaInicio) || !HORA.test(horaFin)) {
        return 'Las horas deben tener el formato HH:MM.';
    }
    // Con el formato HH:MM la comparación de texto equivale a la de horas.
    if (horaFin <= horaInicio) {
        return 'La hora de fin debe ser posterior a la de inicio.';
    }
    if (aFechaLocal(fecha, horaInicio) <= ahora) {
        return 'La fecha y hora de inicio ya pasaron.';
    }
    return null;
}

/** Hora "de pared" (HH:MM) de un instante en El Salvador. */
export function horaLocal(instante: Date): string {
    return new Intl.DateTimeFormat('en-GB', {
        timeZone: ZONA_HORARIA,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).format(instante);
}

/** "Impartida" = Programada cuya hora de fin ya pasó. */
export function estadoVisible(
    clase: { estado: EstadoClase; fin: Date },
    ahora: Date,
): EstadoVisibleClase {
    if (clase.estado === EstadoClase.PROGRAMADA && clase.fin <= ahora) {
        return ESTADO_IMPARTIDA;
    }
    return clase.estado;
}
