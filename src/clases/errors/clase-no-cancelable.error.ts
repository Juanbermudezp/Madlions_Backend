export class ClaseNoCancelableError extends Error {
    constructor(readonly motivo: 'NO_EXISTE' | 'CANCELADA' | 'INICIADA') {
        super(motivo);
        this.name = 'ClaseNoCancelableError';
    }
}
