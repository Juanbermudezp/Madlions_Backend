import { validarNuevoBloque } from './reglas-bloque.js';

// Lunes 9 de noviembre de 2026, 09:00 en El Salvador (15:00 UTC).
const AHORA = new Date('2026-11-09T15:00:00Z');
const valido = { fecha: '2026-11-10', horaInicio: '07:00', duracionMin: 60 };

describe('validarNuevoBloque', () => {
    it.each([45, 60, 90])('acepta la duración de %i minutos', (duracionMin) => {
        expect(validarNuevoBloque({ ...valido, duracionMin }, AHORA)).toBeNull();
    });

    it.each([30, 0, 120])('rechaza la duración de %i minutos', (duracionMin) => {
        expect(validarNuevoBloque({ ...valido, duracionMin }, AHORA)).toBe(
            'La duración debe ser de 45, 60 o 90 minutos.',
        );
    });

    it('acepta una fecha a 28 días', () => {
        expect(validarNuevoBloque({ ...valido, fecha: '2026-12-07' }, AHORA)).toBeNull();
    });

    it('rechaza una fecha a 29 días', () => {
        expect(validarNuevoBloque({ ...valido, fecha: '2026-12-08' }, AHORA)).toBe(
            'La fecha debe estar dentro de los próximos 28 días.',
        );
    });

    it('rechaza una fecha que ya pasó', () => {
        expect(validarNuevoBloque({ ...valido, fecha: '2026-11-08' }, AHORA)).toBe(
            'La fecha ya pasó.',
        );
    });

    it('rechaza una hora de hoy que ya pasó', () => {
        expect(
            validarNuevoBloque({ ...valido, fecha: '2026-11-09', horaInicio: '08:45' }, AHORA),
        ).toBe('La hora de inicio ya pasó.');
    });

    it('acepta una hora de hoy que aún no llega', () => {
        expect(
            validarNuevoBloque({ ...valido, fecha: '2026-11-09', horaInicio: '09:15' }, AHORA),
        ).toBeNull();
    });

    it.each(['05:00', '12:45', '21:00'])('acepta la hora %s', (horaInicio) => {
        expect(validarNuevoBloque({ ...valido, horaInicio }, AHORA)).toBeNull();
    });

    it.each(['04:45', '21:15', '10:10', '10:60', '7:00'])(
        'rechaza la hora %s',
        (horaInicio) => {
            expect(validarNuevoBloque({ ...valido, horaInicio }, AHORA)).toBe(
                'La hora de inicio debe estar entre 5:00 y 21:00, en múltiplos de 15 minutos.',
            );
        },
    );

    it('rechaza una fecha que no existe', () => {
        expect(validarNuevoBloque({ ...valido, fecha: '2026-11-31' }, AHORA)).toBe(
            'La fecha no es válida.',
        );
    });
});