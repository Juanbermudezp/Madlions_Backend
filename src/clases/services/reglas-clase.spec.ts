import { EstadoClase } from '@PrismaClient';
import { estadoVisible, horaLocal, validarHorarioClase } from './reglas-clase.js';

const AHORA = new Date('2026-11-09T15:00:00Z'); // lunes 09:00 en El Salvador
const valido = { fecha: '2026-11-10', horaInicio: '07:00', horaFin: '08:00' };

describe('validarHorarioClase', () => {
    it('acepta un horario futuro con fin posterior al inicio', () => {
        expect(validarHorarioClase(valido, AHORA)).toBeNull();
    });

    it('rechaza fechas que no existen', () => {
        expect(validarHorarioClase({ ...valido, fecha: '2026-02-30' }, AHORA)).toBe(
            'La fecha no es válida.',
        );
    });

    it('rechaza horas fuera de formato', () => {
        expect(validarHorarioClase({ ...valido, horaInicio: '24:00' }, AHORA)).toBe(
            'Las horas deben tener el formato HH:MM.',
        );
        expect(validarHorarioClase({ ...valido, horaFin: '08:60' }, AHORA)).toBe(
            'Las horas deben tener el formato HH:MM.',
        );
    });

    it('rechaza una hora de fin igual o anterior al inicio', () => {
        const motivo = 'La hora de fin debe ser posterior a la de inicio.';
        expect(validarHorarioClase({ ...valido, horaFin: '07:00' }, AHORA)).toBe(motivo);
        expect(validarHorarioClase({ ...valido, horaFin: '06:30' }, AHORA)).toBe(motivo);
    });

    it('rechaza una clase de hoy que ya empezó y una de ayer', () => {
        const motivo = 'La fecha y hora de inicio ya pasaron.';
        expect(validarHorarioClase({ fecha: '2026-11-09', horaInicio: '09:00', horaFin: '10:00' }, AHORA)).toBe(motivo);
        expect(validarHorarioClase({ fecha: '2026-11-08', horaInicio: '18:00', horaFin: '19:00' }, AHORA)).toBe(motivo);
    });

    it('acepta una clase de hoy que empieza un minuto después', () => {
        expect(
            validarHorarioClase({ fecha: '2026-11-09', horaInicio: '09:01', horaFin: '10:00' }, AHORA),
        ).toBeNull();
    });
});

describe('horaLocal', () => {
    it('convierte un instante UTC a la hora de El Salvador', () => {
        expect(horaLocal(new Date('2026-11-10T13:00:00Z'))).toBe('07:00');
        expect(horaLocal(new Date('2026-11-11T05:30:00Z'))).toBe('23:30');
    });
});

describe('estadoVisible', () => {
    const fin = new Date('2026-11-09T14:00:00Z'); // terminó a las 08:00

    it('muestra "Impartida" si está programada y ya terminó', () => {
        expect(estadoVisible({ estado: EstadoClase.PROGRAMADA, fin }, AHORA)).toBe('IMPARTIDA');
    });

    it('deja "Programada" si aún no termina', () => {
        expect(
            estadoVisible({ estado: EstadoClase.PROGRAMADA, fin: new Date('2026-11-09T16:00:00Z') }, AHORA),
        ).toBe(EstadoClase.PROGRAMADA);
    });

    it('una clase cancelada sigue cancelada aunque ya haya pasado', () => {
        expect(estadoVisible({ estado: EstadoClase.CANCELADA_GIMNASIO, fin }, AHORA)).toBe(
            EstadoClase.CANCELADA_GIMNASIO,
        );
    });
});
