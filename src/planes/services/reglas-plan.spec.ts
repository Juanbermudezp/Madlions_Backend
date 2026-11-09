import { TipoPlan } from '@PrismaClient';
import {
    CANTIDAD_CLASES_NO_PERMITIDA,
    CANTIDAD_CLASES_REQUERIDA,
    duracionDiasPorTipo,
    errorCantidadClases,
} from './reglas-plan.js';

describe('duracionDiasPorTipo', () => {
    it('DAYPASS dura 1 día', () => {
        expect(duracionDiasPorTipo(TipoPlan.DAYPASS)).toBe(1);
    });

    it('MENSUAL y SET_CLASES duran 30 días', () => {
        expect(duracionDiasPorTipo(TipoPlan.MENSUAL)).toBe(30);
        expect(duracionDiasPorTipo(TipoPlan.SET_CLASES)).toBe(30);
    });
});

describe('errorCantidadClases', () => {
    describe('SET_CLASES', () => {
        it('exige cantidadClases al crear', () => {
            expect(errorCantidadClases(TipoPlan.SET_CLASES, undefined, true)).toBe(CANTIDAD_CLASES_REQUERIDA);
            expect(errorCantidadClases(TipoPlan.SET_CLASES, null, true)).toBe(CANTIDAD_CLASES_REQUERIDA);
        });

        it('acepta la cantidad al crear', () => {
            expect(errorCantidadClases(TipoPlan.SET_CLASES, 10, true)).toBeNull();
        });

        it('al editar permite no enviarla, pero no dejarla nula', () => {
            expect(errorCantidadClases(TipoPlan.SET_CLASES, undefined, false)).toBeNull();
            expect(errorCantidadClases(TipoPlan.SET_CLASES, 20, false)).toBeNull();
            expect(errorCantidadClases(TipoPlan.SET_CLASES, null, false)).toBe(CANTIDAD_CLASES_REQUERIDA);
        });
    });

    describe.each([TipoPlan.DAYPASS, TipoPlan.MENSUAL])('%s', (tipo) => {
        it('no admite cantidadClases', () => {
            expect(errorCantidadClases(tipo, 5, true)).toBe(CANTIDAD_CLASES_NO_PERMITIDA);
            expect(errorCantidadClases(tipo, 5, false)).toBe(CANTIDAD_CLASES_NO_PERMITIDA);
        });

        it('acepta no enviarla o enviarla nula', () => {
            expect(errorCantidadClases(tipo, undefined, true)).toBeNull();
            expect(errorCantidadClases(tipo, null, true)).toBeNull();
            expect(errorCantidadClases(tipo, undefined, false)).toBeNull();
        });
    });
});
