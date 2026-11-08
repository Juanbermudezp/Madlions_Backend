/**
 * La clase dejó de ser modificable entre la lectura y la escritura (otra
 * petición la canceló o ya empezó). El servicio la traduce a 409.
 */
export class ClaseNoModificableError extends Error {
    constructor() {
        super('La clase ya no se puede modificar.');
        this.name = 'ClaseNoModificableError';
    }
}
