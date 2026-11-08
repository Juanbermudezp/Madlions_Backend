import {
    aFechaLocal,
    esFechaValida,
    hoyLocal,
    sumarDias,
} from '@Common/fechas';

export const DURACIONES_PERMITIDAS: readonly number[] = [45, 60, 90];
export const DIAS_MAXIMOS_ADELANTE = 28;

const PRIMERA_HORA = 5 * 60; // 05:00
const ULTIMA_HORA = 21 * 60; // 21:00

export interface NuevoBloque {
    fecha: string;
    horaInicio: string;
    duracionMin: number;
}

export function validarNuevoBloque(
    { fecha, horaInicio, duracionMin }: NuevoBloque,
    ahora: Date,
): string | null {
    if (!DURACIONES_PERMITIDAS.includes(duracionMin)) {
        return 'La duración debe ser de 45, 60 o 90 minutos.';
    }

    if (!esFechaValida(fecha)) {
        return 'La fecha no es válida.';
    }

    const coincidencia = /^(\d{2}):(\d{2})$/.exec(horaInicio);
    const horas = Number(coincidencia?.[1]);
    const minutos = Number(coincidencia?.[2]);
    const minutosDelDia = horas * 60 + minutos;
    if (
        !coincidencia ||
        minutos >= 60 ||
        minutos % 15 !== 0 ||
        minutosDelDia < PRIMERA_HORA ||
        minutosDelDia > ULTIMA_HORA
    ) {
        return 'La hora de inicio debe estar entre 5:00 y 21:00, en múltiplos de 15 minutos.';
    }

    const hoy = hoyLocal(ahora);
    if (fecha < hoy) {
        return 'La fecha ya pasó.';
    }
    if (fecha > sumarDias(hoy, DIAS_MAXIMOS_ADELANTE)) {
        return 'La fecha debe estar dentro de los próximos 28 días.';
    }
    if (aFechaLocal(fecha, horaInicio) <= ahora) {
        return 'La hora de inicio ya pasó.';
    }

    return null;
}