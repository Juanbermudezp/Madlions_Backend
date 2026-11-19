import {
    dentroDelPlazo,
    fechaLimite,
    finMinimoParaCalificar,
    hayAlgunaCalificacion,
    PLAZO_DIAS,
} from './reglas-resena.js';

const FIN = new Date('2026-11-11T15:00:00.000Z');
const DIA = 24 * 60 * 60 * 1000;
const LIMITE = new Date(FIN.getTime() + PLAZO_DIAS * DIA);

describe('fechaLimite', () => {
    it('el plazo es de 7 días después del fin', () => {
        expect(PLAZO_DIAS).toBe(7);
        expect(fechaLimite(FIN)).toEqual(new Date('2026-11-18T15:00:00.000Z'));
    });
});

describe('dentroDelPlazo', () => {
    describe('límites exactos', () => {
        it('el mismo instante en que termina está dentro', () => {
            expect(dentroDelPlazo(FIN, FIN)).toBe(true);
        });

        it('un milisegundo antes de cumplir los 7 días está dentro', () => {
            expect(dentroDelPlazo(FIN, new Date(LIMITE.getTime() - 1))).toBe(true);
        });

        it('los 7 días exactos todavía cuentan', () => {
            expect(dentroDelPlazo(FIN, LIMITE)).toBe(true);
        });

        it('un milisegundo después ya no', () => {
            expect(dentroDelPlazo(FIN, new Date(LIMITE.getTime() + 1))).toBe(false);
        });

        it('al día siguiente del límite tampoco (el caso de la ficha: 8 días)', () => {
            expect(dentroDelPlazo(FIN, new Date(FIN.getTime() + 8 * DIA))).toBe(false);
        });
    });

    it('a mitad del plazo sigue dentro', () => {
        expect(dentroDelPlazo(FIN, new Date(FIN.getTime() + 3 * DIA))).toBe(true);
    });
});

describe('finMinimoParaCalificar', () => {
    it('el corte para listar y el límite para guardar son la misma regla', () => {
        const ahora = LIMITE;

        expect(finMinimoParaCalificar(ahora).getTime()).toBe(FIN.getTime());
        expect(dentroDelPlazo(FIN, ahora)).toBe(true);
    });
});

describe('hayAlgunaCalificacion', () => {
    it('con cualquiera de las tres alcanza (criterio 2)', () => {
        expect(hayAlgunaCalificacion({ calActividad: 5 })).toBe(true);
        expect(hayAlgunaCalificacion({ calEntrenador: 1 })).toBe(true);
        expect(hayAlgunaCalificacion({ calInstalaciones: 3 })).toBe(true);
    });

    it('con las tres también', () => {
        expect(
            hayAlgunaCalificacion({ calActividad: 5, calEntrenador: 4, calInstalaciones: 3 }),
        ).toBe(true);
    });

    it('sin ninguna, no (criterio 4)', () => {
        expect(hayAlgunaCalificacion({})).toBe(false);
    });
});
