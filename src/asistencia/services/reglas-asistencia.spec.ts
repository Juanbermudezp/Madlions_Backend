import {
    dentroDeLaVentana,
    finMinimoParaListar,
    limiteDeLaVentana,
    VENTANA_HORAS,
} from './reglas-asistencia.js';

const INICIO = new Date('2026-11-18T14:00:00.000Z');
const FIN = new Date('2026-11-18T15:00:00.000Z');
const UNA_HORA = 60 * 60 * 1000;
const LIMITE = new Date(FIN.getTime() + VENTANA_HORAS * UNA_HORA);

function enInstante(desplazamientoMs: number, desde: Date): Date {
    return new Date(desde.getTime() + desplazamientoMs);
}

describe('dentroDeLaVentana', () => {
    it('la ventana son 24 horas después del fin', () => {
        expect(VENTANA_HORAS).toBe(24);
        expect(limiteDeLaVentana(FIN)).toEqual(new Date('2026-11-19T15:00:00.000Z'));
    });

    describe('límites exactos', () => {
        it('un milisegundo antes del inicio queda fuera', () => {
            expect(dentroDeLaVentana(INICIO, FIN, enInstante(-1, INICIO))).toBe(false);
        });

        it('el instante del inicio ya cuenta', () => {
            expect(dentroDeLaVentana(INICIO, FIN, INICIO)).toBe(true);
        });

        it('el instante del fin cuenta', () => {
            expect(dentroDeLaVentana(INICIO, FIN, FIN)).toBe(true);
        });

        it('las 24 horas exactas después del fin cuentan', () => {
            expect(dentroDeLaVentana(INICIO, FIN, LIMITE)).toBe(true);
        });

        it('un milisegundo después de las 24 horas queda fuera', () => {
            expect(dentroDeLaVentana(INICIO, FIN, enInstante(1, LIMITE))).toBe(false);
        });

        it('un minuto después de las 24 horas queda fuera (el caso de la ficha)', () => {
            expect(dentroDeLaVentana(INICIO, FIN, enInstante(60_000, LIMITE))).toBe(false);
        });
    });

    it('mientras la actividad ocurre está dentro', () => {
        expect(dentroDeLaVentana(INICIO, FIN, enInstante(30 * 60 * 1000, INICIO))).toBe(true);
    });

    it('horas antes de empezar está fuera', () => {
        expect(dentroDeLaVentana(INICIO, FIN, enInstante(-3 * UNA_HORA, INICIO))).toBe(false);
    });

    it('a la mitad de la ventana sigue dentro', () => {
        expect(dentroDeLaVentana(INICIO, FIN, enInstante(12 * UNA_HORA, FIN))).toBe(true);
    });
});

describe('finMinimoParaListar', () => {
    it('una actividad se lista mientras terminó hace 24 horas o menos', () => {
        const ahora = new Date('2026-11-19T15:00:00.000Z');

        expect(finMinimoParaListar(ahora)).toEqual(new Date('2026-11-18T15:00:00.000Z'));
    });

    it('el corte y el límite de la ventana son la misma regla vista al revés', () => {
        const ahora = LIMITE;

        // La actividad que termina justo en el corte todavía se lista...
        expect(finMinimoParaListar(ahora).getTime()).toBe(FIN.getTime());
        // ...y marcarla todavía se acepta.
        expect(dentroDeLaVentana(INICIO, FIN, ahora)).toBe(true);
    });
});
