import { TipoPlan } from '@PrismaClient';
import { calcularCobertura } from './reglas-cobertura.js';

/** Instante a una hora local de El Salvador (UTC-6). */
const local = (dia: string, hora = '10:00') => new Date(`${dia}T${hora}:00-06:00`);

describe('calcularCobertura', () => {
    describe('pago respecto de la fecha solicitada (Mensual, 30 días)', () => {
        it('pago ANTES de la fecha solicitada: empieza en la fecha solicitada', () => {
            expect(calcularCobertura('2026-11-20', local('2026-11-15'), TipoPlan.MENSUAL)).toEqual({
                fechaInicio: '2026-11-20',
                fechaVencimiento: '2026-12-19',
            });
        });

        it('pago EL MISMO DÍA de la fecha solicitada: empieza ese día', () => {
            expect(calcularCobertura('2026-11-20', local('2026-11-20', '23:59'), TipoPlan.MENSUAL)).toEqual({
                fechaInicio: '2026-11-20',
                fechaVencimiento: '2026-12-19',
            });
        });

        it('pago DESPUÉS de la fecha solicitada: empieza el día del pago y no se pierden días', () => {
            expect(calcularCobertura('2026-11-20', local('2026-11-25'), TipoPlan.MENSUAL)).toEqual({
                fechaInicio: '2026-11-25',
                fechaVencimiento: '2026-12-24',
            });
        });
    });

    describe('renovación de una membresía vigente', () => {
        // La anterior vence el 30/11, así que la renovación se solicitó para el 01/12.
        it('si se paga mientras la anterior sigue vigente, la cobertura continúa sin huecos', () => {
            expect(calcularCobertura('2026-12-01', local('2026-11-28'), TipoPlan.MENSUAL)).toEqual({
                fechaInicio: '2026-12-01',
                fechaVencimiento: '2026-12-30',
            });
        });

        it('si se paga después de que la anterior venció, empieza el día del pago', () => {
            expect(calcularCobertura('2026-12-01', local('2026-12-05'), TipoPlan.SET_CLASES)).toEqual({
                fechaInicio: '2026-12-05',
                fechaVencimiento: '2027-01-03',
            });
        });
    });

    describe('zona horaria y duración', () => {
        it('usa el día del pago en UTC-6, no en UTC', () => {
            // 03:00 UTC del 21/11 son las 21:00 del 20/11 en El Salvador.
            const pago = new Date('2026-11-21T03:00:00Z');
            expect(calcularCobertura('2026-11-15', pago, TipoPlan.MENSUAL).fechaInicio).toBe('2026-11-20');
        });

        it('Daypass cubre un solo día', () => {
            expect(calcularCobertura('2026-11-20', local('2026-11-22'), TipoPlan.DAYPASS)).toEqual({
                fechaInicio: '2026-11-22',
                fechaVencimiento: '2026-11-22',
            });
        });
    });
});
