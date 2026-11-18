import { MENSAJES_RESERVA, semanaReservable } from './reglas-reserva.js';

// Martes 10 de noviembre de 2026, 09:00 en El Salvador.
const AHORA = new Date('2026-11-10T15:00:00Z');

describe('semanaReservable (BE-5.1)', () => {
    it('sin semana devuelve el lunes de la semana actual', () => {
        expect(semanaReservable(undefined, AHORA)).toEqual({ lunes: '2026-11-09' });
    });

    it('acepta cualquier día de la semana actual', () => {
        expect(semanaReservable('2026-11-15', AHORA)).toEqual({ lunes: '2026-11-09' });
    });

    it('acepta la semana siguiente', () => {
        expect(semanaReservable('2026-11-16', AHORA)).toEqual({ lunes: '2026-11-16' });
        expect(semanaReservable('2026-11-22', AHORA)).toEqual({ lunes: '2026-11-16' });
    });

    it('rechaza la semana anterior y la de dentro de dos semanas', () => {
        expect(semanaReservable('2026-11-08', AHORA)).toEqual({ error: MENSAJES_RESERVA.semanaFueraDeRango });
        expect(semanaReservable('2026-11-23', AHORA)).toEqual({ error: MENSAJES_RESERVA.semanaFueraDeRango });
    });

    it('rechaza una fecha que no existe', () => {
        expect(semanaReservable('2026-02-30', AHORA)).toEqual({ error: MENSAJES_RESERVA.semanaInvalida });
    });

    it('usa la fecha de El Salvador: el domingo a las 23:00 locales sigue siendo la misma semana', () => {
        // Domingo 15 de noviembre, 23:00 en El Salvador = lunes 16, 05:00 UTC.
        const domingoNoche = new Date('2026-11-16T05:00:00Z');
        expect(semanaReservable(undefined, domingoNoche)).toEqual({ lunes: '2026-11-09' });
    });
});
