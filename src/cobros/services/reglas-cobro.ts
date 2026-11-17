import { EstadoCobro } from '@PrismaClient';

/** Date de una columna DATE (medianoche UTC) -> "AAAA-MM-DD". */
export function aDia(fecha: Date): string {
    return fecha.toISOString().slice(0, 10);
}

/**
 * Un cobro se puede pagar si sigue PENDIENTE y ya llegó su fecha de
 * habilitación (renovaciones, supuesto S3). Sin fecha, se puede pagar desde
 * que se genera. `hoy` en AAAA-MM-DD, hora de El Salvador (UTC-6).
 */
export function estaHabilitado(
    cobro: { estado: EstadoCobro; habilitadoDesde: Date | null },
    hoy: string,
): boolean {
    if (cobro.estado !== EstadoCobro.PENDIENTE) return false;
    return cobro.habilitadoDesde === null || aDia(cobro.habilitadoDesde) <= hoy;
}
