import { esFechaValida, hoyLocal, sumarDias } from '@Common/fechas';

/**
 * Reglas comunes de los reportes del Módulo 10 (H26 a H29).
 * Son funciones puras: H27, H28 y H29 reutilizan el rango y H29 reutiliza el
 * cálculo de ocupación de H26, sin duplicar las fórmulas.
 */

export const DIAS_POR_DEFECTO = 30;
export const MESES_MAXIMOS = 12;

export const MENSAJES_REPORTE = {
    fechaInvalida: 'Las fechas deben tener el formato AAAA-MM-DD y existir en el calendario.',
    inicioPosterior: 'La fecha de inicio no puede ser posterior a la de fin',
    rangoMaximo: 'El rango máximo es de 12 meses',
} as const;

/** Suma meses a una fecha AAAA-MM-DD; si el día no existe en el mes destino, usa el último día (31/01 + 1 mes = 28/02). */
export function sumarMeses(fecha: string, meses: number): string {
    const [anio, mes, dia] = fecha.split('-').map(Number);
    const destino = new Date(Date.UTC(anio, mes - 1 + meses, 1));
    const ultimoDia = new Date(Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0)).getUTCDate();
    destino.setUTCDate(Math.min(dia, ultimoDia));
    return destino.toISOString().slice(0, 10);
}

/**
 * Rango de fechas de un reporte, ambos días incluidos, en hora de El Salvador.
 * - Sin fechas: los últimos 30 días (hoy y los 29 anteriores).
 * - Con solo una de las dos, la otra se completa para formar 30 días.
 * - Máximo 12 meses: `hasta` puede llegar hasta el día anterior a `desde` + 12 meses
 *   (del 01/01/2026 al 31/12/2026 se acepta; al 01/01/2027 no).
 */
export function resolverRango(
    desde: string | undefined,
    hasta: string | undefined,
    ahora: Date = new Date(),
): { desde: string; hasta: string } | { error: string } {
    if ((desde && !esFechaValida(desde)) || (hasta && !esFechaValida(hasta))) {
        return { error: MENSAJES_REPORTE.fechaInvalida };
    }
    const fin = hasta ?? (desde ? sumarDias(desde, DIAS_POR_DEFECTO - 1) : hoyLocal(ahora));
    const inicio = desde ?? sumarDias(fin, -(DIAS_POR_DEFECTO - 1));
    if (inicio > fin) return { error: MENSAJES_REPORTE.inicioPosterior };
    if (fin >= sumarMeses(inicio, MESES_MAXIMOS)) return { error: MENSAJES_REPORTE.rangoMaximo };
    return { desde: inicio, hasta: fin };
}

/** Redondea a un decimal (half-up: 29.95 → 30.0). */
export function redondear1(valor: number): number {
    return Math.round((valor + Number.EPSILON) * 10) / 10;
}

/** Ocupación (%) = reservas confirmadas ÷ suma del cupo máximo × 100, con un decimal. 0 si no hay cupo. */
export function calcularOcupacion(reservasConfirmadas: number, cupoTotal: number): number {
    if (cupoTotal <= 0) return 0;
    return redondear1((reservasConfirmadas / cupoTotal) * 100);
}

export type EtiquetaOcupacion = 'BAJA' | 'ALTA';
export const UMBRAL_BAJA = 30;
export const UMBRAL_ALTA = 90;

/** Menos del 30 % → "Baja ocupación"; 90 % o más → "Alta demanda"; en medio, sin etiqueta. */
export function etiquetaOcupacion(ocupacion: number): EtiquetaOcupacion | null {
    if (ocupacion < UMBRAL_BAJA) return 'BAJA';
    if (ocupacion >= UMBRAL_ALTA) return 'ALTA';
    return null;
}
