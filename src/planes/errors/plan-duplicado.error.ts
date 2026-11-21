/**
 * Error de dominio: ya existe un plan con ese nombre.
 *
 * Lo lanza el repositorio al detectar la violación del índice único y el
 * servicio lo traduce a 409, igual que TipoClaseDuplicadoError en H4.
 */
export class PlanDuplicadoError extends Error {
    constructor(public readonly nombre: string) {
        super(`Ya existe un plan con el nombre "${nombre}".`);
        this.name = 'PlanDuplicadoError';
    }
}
