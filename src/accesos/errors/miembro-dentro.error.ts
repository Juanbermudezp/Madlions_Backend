export class MiembroDentroError extends Error {
    constructor() {
        super('El miembro ya tiene un ingreso abierto.');
        this.name = 'MiembroDentroError';
    }
}