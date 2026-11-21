import type { EstadoMembresiaMiembro } from '@Membresias/services';

/**
 * Estados con alerta roja (H11): el miembro solo entra con un motivo de
 * excepción. Vigente, Próxima a vencer y Por iniciar entran normal.
 */
export const ESTADOS_CON_EXCEPCION: readonly EstadoMembresiaMiembro[] = [
    'VENCIDA',
    'PENDIENTE_PAGO',
    'SIN_MEMBRESIA',
];

export const MOTIVO_MIN = 10;
export const MOTIVO_MAX = 250;

export function requiereMotivo(estado: EstadoMembresiaMiembro): boolean {
    return ESTADOS_CON_EXCEPCION.includes(estado);
}

/** El motivo, sin espacios al inicio ni al final, debe tener de 10 a 250 caracteres. */
export function motivoValido(motivo: string | undefined): boolean {
    const largo = motivo?.trim().length ?? 0;
    return largo >= MOTIVO_MIN && largo <= MOTIVO_MAX;
}