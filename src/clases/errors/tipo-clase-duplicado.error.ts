/**
 * Error de dominio: ya existe un tipo de clase con ese nombre.
 *
 * Lo lanza el repositorio al detectar la violación del índice único y el
 * servicio lo traduce a 409, igual que EmailAlreadyTakenError en usuarios.
 */
export class TipoClaseDuplicadoError extends Error {
    constructor(public readonly nombre: string) {
        super(`Ya existe un tipo de clase con el nombre "${nombre}".`);
        this.name = 'TipoClaseDuplicadoError';
    }
}
