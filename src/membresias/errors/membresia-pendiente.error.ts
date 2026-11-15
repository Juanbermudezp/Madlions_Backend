/**
 * Error de dominio: el miembro ya tiene una compra o renovación PENDIENTE_PAGO.
 *
 * Lo lanza el repositorio cuando el índice único parcial
 * `membresia_miembro_pendiente_pago_key` rechaza la fila (dos registros a la
 * vez) y el servicio lo traduce a 409.
 */
export class MembresiaPendienteError extends Error {
    constructor(public readonly miembroId: string) {
        super(`El miembro ${miembroId} ya tiene una membresía pendiente de pago.`);
        this.name = 'MembresiaPendienteError';
    }
}
