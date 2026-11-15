import { hoyLocal, sumarDias } from '@Common/fechas';
import { duracionDiasPorTipo } from '@Planes/services';
import type { TipoPlan } from '@PrismaClient';

export interface Cobertura {
    /** AAAA-MM-DD */
    fechaInicio: string;
    /** AAAA-MM-DD */
    fechaVencimiento: string;
}

/**
 * Cobertura de una membresía al aprobarse su pago (H2, criterio 5 · S3).
 *
 * - Inicio = la mayor entre la fecha solicitada por recepción y el día del
 *   pago en hora de El Salvador (UTC-6): si se paga tarde, la cobertura
 *   empieza el día del pago y el miembro no pierde días pagados.
 * - Vencimiento = inicio + duración del plan − 1 (Daypass: el mismo día).
 *
 * En la renovación de una membresía vigente, la fecha solicitada ya es el
 * día siguiente al vencimiento anterior, así que la cobertura continúa sin
 * huecos si se paga antes.
 */
export function calcularCobertura(
    fechaInicioSolicitada: string,
    fechaPago: Date,
    tipoPlan: TipoPlan,
): Cobertura {
    const diaPago = hoyLocal(fechaPago);
    const fechaInicio = diaPago > fechaInicioSolicitada ? diaPago : fechaInicioSolicitada;
    return {
        fechaInicio,
        fechaVencimiento: sumarDias(fechaInicio, duracionDiasPorTipo(tipoPlan) - 1),
    };
}
