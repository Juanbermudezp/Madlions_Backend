export class HorarioOcupadoError extends Error {
    constructor() {
        super('El entrenador ya tiene una actividad en ese horario.');
        this.name = 'HorarioOcupadoError';
    }
}