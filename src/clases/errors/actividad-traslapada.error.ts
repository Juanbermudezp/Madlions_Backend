/** El entrenador ya tiene una clase o un bloque que choca con el horario. */
export class ActividadTraslapadaError extends Error {
    constructor() {
        super('El entrenador ya tiene una actividad en ese horario.');
        this.name = 'ActividadTraslapadaError';
    }
}
