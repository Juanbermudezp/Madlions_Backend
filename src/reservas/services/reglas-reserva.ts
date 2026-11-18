import { ZONA_HORARIA, esFechaValida, hoyLocal, lunesDe, sumarDias } from '@Common/fechas';

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

/** Mensajes de rechazo de una reserva (BE-5.2). Todos responden 409. */
export const RECHAZOS_RESERVA = {
    noDisponible: 'La clase ya no está disponible',
    sinMembresiaVigente: 'Necesitas una membresía vigente para reservar',
    fueraDeCobertura: 'Tu membresía no cubre la fecha de esta clase',
    tipoNoIncluido: 'Tu plan no incluye este tipo de clase',
    yaReservada: 'Ya reservaste esta clase',
    traslape: 'Tienes otra actividad en ese horario',
    sinCreditos: 'No te quedan clases disponibles en tu plan',
    llena: 'La clase está llena',
} as const;
export type RechazoReserva = (typeof RECHAZOS_RESERVA)[keyof typeof RECHAZOS_RESERVA];

/** Datos que se revisan para aceptar o rechazar una reserva, ya leídos dentro de la transacción. */
export interface DatosReserva {
    ahora: Date;
    clase: { estado: string; inicio: Date; tipoClaseId: string; cupoMaximo: number };
    /** Estado de membresía del miembro (BE-2.4). */
    membresia: {
        estado: string;
        fechaInicio: string | null;
        fechaVencimiento: string | null;
        tiposClaseIds: string[] | null;
        /** Clases del set; null si no es Set de clases mensual. */
        creditosTotales: number | null;
    };
    /** Reservas CONFIRMADA de la membresía (créditos ya comprometidos). */
    creditosUsados: number;
    reservasConfirmadasDeLaClase: number;
    yaReservada: boolean;
    tieneTraslape: boolean;
}

/**
 * Revisa las reglas de H5 en orden y devuelve el primer motivo de rechazo, o
 * null si la reserva se puede registrar. El orden importa: primero lo que no
 * depende del miembro (la clase), después su membresía y al final el cupo,
 * para que el miembro vea el motivo que le toca a él antes que "llena".
 */
export function motivoDeRechazo(d: DatosReserva): RechazoReserva | null {
    if (d.clase.estado !== 'PROGRAMADA' || d.clase.inicio <= d.ahora) {
        return RECHAZOS_RESERVA.noDisponible;
    }
    const { membresia } = d;
    if (membresia.estado !== 'VIGENTE' && membresia.estado !== 'PROXIMA_A_VENCER') {
        return RECHAZOS_RESERVA.sinMembresiaVigente;
    }
    const fechaClase = hoyLocal(d.clase.inicio);
    if (
        !membresia.fechaInicio ||
        !membresia.fechaVencimiento ||
        fechaClase < membresia.fechaInicio ||
        fechaClase > membresia.fechaVencimiento
    ) {
        return RECHAZOS_RESERVA.fueraDeCobertura;
    }
    if (!membresia.tiposClaseIds?.includes(d.clase.tipoClaseId)) {
        return RECHAZOS_RESERVA.tipoNoIncluido;
    }
    if (d.yaReservada) return RECHAZOS_RESERVA.yaReservada;
    if (d.tieneTraslape) return RECHAZOS_RESERVA.traslape;
    if (membresia.creditosTotales !== null && d.creditosUsados >= membresia.creditosTotales) {
        return RECHAZOS_RESERVA.sinCreditos;
    }
    if (d.reservasConfirmadasDeLaClase >= d.clase.cupoMaximo) return RECHAZOS_RESERVA.llena;
    return null;
}

const FORMATO_FECHA = new Intl.DateTimeFormat('es-SV', {
    timeZone: ZONA_HORARIA,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
});
const FORMATO_HORA = new Intl.DateTimeFormat('es-SV', {
    timeZone: ZONA_HORARIA,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
});

/** dd/mm/aaaa en hora de El Salvador. */
export function fechaCorta(fecha: Date): string {
    return FORMATO_FECHA.format(fecha);
}

/** hh:mm (24 h) en hora de El Salvador. */
export function horaCorta(fecha: Date): string {
    return FORMATO_HORA.format(fecha);
}

/** Título y mensaje del aviso "Reserva confirmada" (criterio 9 de H5). */
export function avisoReservaConfirmada(clase: {
    tipo: string;
    entrenador: string;
    inicio: Date;
    fin: Date;
}): { titulo: string; mensaje: string } {
    return {
        titulo: `Reserva confirmada: ${clase.tipo}`,
        mensaje:
            `Tu lugar en ${clase.tipo} del ${fechaCorta(clase.inicio)} de ${horaCorta(clase.inicio)} ` +
            `a ${horaCorta(clase.fin)} con ${clase.entrenador} quedó reservado. ` +
            'Puedes cancelar hasta 2 horas antes del inicio.',
    };
}
