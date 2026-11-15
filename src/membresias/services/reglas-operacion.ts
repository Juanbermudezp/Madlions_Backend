import { TipoOperacionMembresia, TipoPlan } from '@PrismaClient';
import { sumarDias } from '@Common/fechas';

export const FECHA_INICIO_INVALIDA = 'La fecha de inicio debe estar entre hoy y los próximos 30 días';

/** Días hacia adelante que recepción puede elegir como inicio. */
export const DIAS_MAXIMOS_INICIO = 30;

/** Membresía PAGADA del mismo plan, candidata a renovarse. */
export interface MembresiaPagadaDelPlan {
    id: string;
    fechaVencimiento: Date;
}

export interface DatosOperacion {
    tipoPlan: TipoPlan;
    duracionDias: number;
    /** Membresías PAGADAS del miembro con este mismo plan. */
    pagadasDelPlan: MembresiaPagadaDelPlan[];
    /** Hoy en hora de El Salvador (AAAA-MM-DD). */
    hoy: string;
    /** Fecha elegida por recepción (AAAA-MM-DD); por defecto, hoy. */
    fechaSolicitada?: string;
}

export interface OperacionMembresia {
    tipoOperacion: TipoOperacionMembresia;
    membresiaAnteriorId: string | null;
    fechaInicio: string;
    fechaVencimiento: string;
    /** true si la fecha la fijó el sistema (renovación de una membresía vigente). */
    fechaInicioFija: boolean;
}

export type ResultadoOperacion = { ok: true; operacion: OperacionMembresia } | { ok: false; error: string };

function aDia(fecha: Date): string {
    return fecha.toISOString().slice(0, 10);
}

/**
 * Regla de compra o renovación (H2, criterios 2 y 3).
 *
 * - Es RENOVACION si el plan es Mensual o Set de clases mensual y el miembro
 *   tiene una membresía PAGADA de ese mismo plan, vigente o vencida. En
 *   cualquier otro caso, incluido todo Daypass, es COMPRA.
 * - Si la membresía que se renueva sigue vigente (vence hoy o después), la
 *   fecha de inicio queda fija en el día siguiente a su vencimiento y se
 *   ignora la elegida.
 * - En los demás casos la fecha elegida (por defecto hoy) debe estar entre hoy
 *   y los próximos 30 días.
 * - El vencimiento es inicio + duración del plan - 1 (Daypass: el mismo día).
 */
export function determinarOperacion(datos: DatosOperacion): ResultadoOperacion {
    const { tipoPlan, duracionDias, pagadasDelPlan, hoy } = datos;

    const anterior =
        tipoPlan === TipoPlan.DAYPASS
            ? undefined
            : [...pagadasDelPlan].sort((a, b) => b.fechaVencimiento.getTime() - a.fechaVencimiento.getTime())[0];

    let fechaInicio: string;
    let fechaInicioFija = false;

    if (anterior && aDia(anterior.fechaVencimiento) >= hoy) {
        fechaInicio = sumarDias(aDia(anterior.fechaVencimiento), 1);
        fechaInicioFija = true;
    } else {
        fechaInicio = datos.fechaSolicitada ?? hoy;
        if (fechaInicio < hoy || fechaInicio > sumarDias(hoy, DIAS_MAXIMOS_INICIO)) {
            return { ok: false, error: FECHA_INICIO_INVALIDA };
        }
    }

    return {
        ok: true,
        operacion: {
            tipoOperacion: anterior ? TipoOperacionMembresia.RENOVACION : TipoOperacionMembresia.COMPRA,
            membresiaAnteriorId: anterior?.id ?? null,
            fechaInicio,
            fechaVencimiento: sumarDias(fechaInicio, duracionDias - 1),
            fechaInicioFija,
        },
    };
}
