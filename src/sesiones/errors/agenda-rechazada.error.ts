/** Mensajes de los criterios 5 a 8 de H9. */
export const MENSAJES_AGENDA = {
    NO_DISPONIBLE: 'Este horario ya no está disponible',
    ANTICIPACION: 'Solo puedes agendar con al menos 2 horas de anticipación',
    MEMBRESIA: 'Necesitas una membresía vigente para agendar',
    LIMITE: 'Ya tienes 5 sesiones agendadas que no han empezado',
    TRASLAPE_SESION: 'Ya tienes otra sesión agendada en ese horario',
    TRASLAPE_CLASE: 'Ya tienes una clase reservada en ese horario',
} as const;

/**
 * Error de dominio: el agendamiento no cumple una regla de H9. Si se lanza
 * dentro de la transacción, PostgreSQL deshace todo (bloque, cobro y sesión).
 * El servicio lo traduce a 409.
 */
export class AgendaRechazadaError extends Error {
    constructor(motivo: string) {
        super(motivo);
        this.name = 'AgendaRechazadaError';
    }
}