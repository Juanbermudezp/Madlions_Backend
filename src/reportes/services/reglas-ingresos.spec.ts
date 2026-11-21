import { ConceptoCobro, Prisma, TipoPlan } from '@PrismaClient';
import type { FilaIngreso } from '../repositories/reportes.repository.js';
import { desglosarIva } from '../../cobros/services/reglas-pago.js';
import { desglosarIvaIngresos, periodoAnterior, resumirIngresos } from './reglas-ingresos.js';

const fila = (concepto: ConceptoCobro, total: string, tipoPlan: TipoPlan | null = null, fecha = '2026-11-18'): FilaIngreso =>
    ({ concepto, total: new Prisma.Decimal(total), tipoPlan, fecha });

describe('H27 período anterior por días calendario', () => {
    it.each([
        ['2026-11-11', '2026-11-20', '2026-11-01', '2026-11-10'],
        ['2026-11-18', '2026-11-18', '2026-11-17', '2026-11-17'],
        ['2026-01-01', '2026-01-03', '2025-12-29', '2025-12-31'],
        ['2024-02-28', '2024-03-01', '2024-02-25', '2024-02-27'],
        ['2024-01-01', '2024-12-31', '2022-12-31', '2023-12-31'],
    ])('%s a %s tiene anterior %s a %s', (desde, hasta, inicioAnterior, finAnterior) => {
        expect(periodoAnterior(desde, hasta)).toEqual({ desde: inicioAnterior, hasta: finAnterior });
    });
});

describe('H27 S7: Decimal y reglas de IVA H12', () => {
    it.each(['0.00', '0.01', '0.05', '0.10', '12.50', '35.50', '50.00', '1130.00', '99999999.99'])(
        'equivale al desglose H12 para %s sin usar number en los cálculos', (monto) => {
            const actual = desglosarIvaIngresos(new Prisma.Decimal(monto));
            const esperado = desglosarIva(monto);
            expect(actual.total.toFixed(2)).toBe(esperado.total.toFixed(2));
            expect(actual.subtotal.toFixed(2)).toBe(esperado.subtotal.toFixed(2));
            expect(actual.iva.toFixed(2)).toBe(esperado.iva.toFixed(2));
            expect(actual.subtotal.plus(actual.iva).equals(actual.total)).toBe(true);
        },
    );
    it('mantiene centavos por encima del entero seguro de H12 y no altera Decimal global', () => {
        const precision = Prisma.Decimal.precision;
        const monto = new Prisma.Decimal('9007199254740991.99');
        const resultado = desglosarIvaIngresos(monto);
        expect(resultado.total.toFixed(2)).toBe('9007199254740991.99');
        expect(resultado.subtotal.plus(resultado.iva).equals(monto)).toBe(true);
        expect(Prisma.Decimal.precision).toBe(precision);
    });
    it('calcula IVA sobre el total agregado, no suma redondeos de comprobantes', () => {
        const res = resumirIngresos([fila('MEMBRESIA', '0.05', 'MENSUAL'), fila('MEMBRESIA', '0.05', 'MENSUAL')], '2026-11-18', '2026-11-18');
        expect(res).toMatchObject({ total: 0.1, subtotal: 0.09, iva: 0.01 });
        expect(desglosarIva('0.05').subtotal * 2).toBe(0.08);
    });
    it('0.10 + 0.20 no acumula el error binario de number', () => {
        const res = resumirIngresos([fila('MEMBRESIA', '0.10'), fila('RENOVACION', '0.20')], '2026-11-18', '2026-11-18');
        expect(res.total).toBe(0.3);
        expect(res.porDia).toEqual([{ fecha: '2026-11-18', total: 0.3 }]);
    });
});

describe('H27 resumen por concepto, plan histórico, día y comparación', () => {
    it('desglosa los tres conceptos y tipos históricos y rellena el día vacío', () => {
        const res = resumirIngresos([
            fila('MEMBRESIA', '100', 'DAYPASS'), fila('MEMBRESIA', '400', 'MENSUAL'),
            fila('RENOVACION', '200', 'MENSUAL'), fila('RENOVACION', '200', 'SET_CLASES'),
            fila('SESION_ADICIONAL', '230'), fila('SESION_ADICIONAL', '900', null, '2026-11-17'),
        ], '2026-11-18', '2026-11-19');
        expect(res).toEqual({ total: 1130, subtotal: 1000, iva: 130,
            porConcepto: [{ concepto: 'MEMBRESIA', total: 500 }, { concepto: 'RENOVACION', total: 400 }, { concepto: 'SESION_ADICIONAL', total: 230 }],
            porTipoPlan: [{ tipoPlan: 'DAYPASS', total: 100 }, { tipoPlan: 'MENSUAL', total: 600 }, { tipoPlan: 'SET_CLASES', total: 200 }],
            porDia: [{ fecha: '2026-11-18', total: 1130 }, { fecha: '2026-11-19', total: 0 }],
            anterior: { total: 900, diferencia: 230, porcentaje: 25.6 },
        });
    });
    it('las sesiones no se atribuyen a un plan ni siquiera con un tipo inconsistente', () => {
        const res = resumirIngresos([fila('SESION_ADICIONAL', '20', 'MENSUAL')], '2026-11-18', '2026-11-18');
        expect(res.total).toBe(20);
        expect(res.porTipoPlan.every((p) => p.total === 0)).toBe(true);
    });
    it('un origen sin membresía histórica conserva el total y no inventa tipo de plan', () => {
        const res = resumirIngresos([fila('MEMBRESIA', '20')], '2026-11-18', '2026-11-18');
        expect(res.porConcepto[0]).toEqual({ concepto: 'MEMBRESIA', total: 20 });
        expect(res.porTipoPlan.every((p) => p.total === 0)).toBe(true);
    });
    it('anterior cero: conserva diferencia y devuelve porcentaje null', () => {
        const res = resumirIngresos([fila('MEMBRESIA', '35.50', 'MENSUAL')], '2026-11-18', '2026-11-18');
        expect(res.anterior).toEqual({ total: 0, diferencia: 35.5, porcentaje: null });
    });
    it('diferencia negativa y porcentaje HALF_UP negativo en un empate exacto', () => {
        const res = resumirIngresos([fila('MEMBRESIA', '35.50'), fila('MEMBRESIA', '40', null, '2026-11-17')], '2026-11-18', '2026-11-18');
        expect(res.anterior).toEqual({ total: 40, diferencia: -4.5, porcentaje: -11.3 });
    });
    it('actual cero con anterior positivo da -100 %, no null', () => {
        const res = resumirIngresos([fila('MEMBRESIA', '40', null, '2026-11-17')], '2026-11-18', '2026-11-18');
        expect(res.anterior).toEqual({ total: 40, diferencia: -40, porcentaje: -100 });
    });
    it('sin ingresos en ambos períodos: ceros, todos los días y comparación null', () => {
        const res = resumirIngresos([], '2026-12-31', '2027-01-01');
        expect(res).toMatchObject({ total: 0, subtotal: 0, iva: 0, anterior: { total: 0, diferencia: 0, porcentaje: null } });
        expect(res.porConcepto).toHaveLength(3); expect(res.porTipoPlan).toHaveLength(3);
        expect(res.porDia).toEqual([{ fecha: '2026-12-31', total: 0 }, { fecha: '2027-01-01', total: 0 }]);
    });
});
