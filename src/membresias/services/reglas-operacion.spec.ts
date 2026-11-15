import { TipoOperacionMembresia, TipoPlan } from '@PrismaClient';
import { FECHA_INICIO_INVALIDA, determinarOperacion, type DatosOperacion } from './reglas-operacion.js';

const HOY = '2026-11-15';
const vence = (id: string, dia: string) => ({ id, fechaVencimiento: new Date(`${dia}T00:00:00Z`) });
const base = (datos: Partial<DatosOperacion> = {}): DatosOperacion => ({
    tipoPlan: TipoPlan.MENSUAL,
    duracionDias: 30,
    pagadasDelPlan: [],
    hoy: HOY,
    ...datos,
});
const operacion = (datos: Partial<DatosOperacion>) => {
    const r = determinarOperacion(base(datos));
    if (!r.ok) throw new Error(r.error);
    return r.operacion;
};

describe('determinarOperacion · compra o renovación', () => {
    describe('COMPRA', () => {
        it('sin membresías pagadas del plan es COMPRA', () => {
            expect(operacion({})).toMatchObject({ tipoOperacion: TipoOperacionMembresia.COMPRA, membresiaAnteriorId: null });
        });

        it('todo Daypass es COMPRA, aunque haya otro Daypass pagado vigente o vencido', () => {
            const daypass = { tipoPlan: TipoPlan.DAYPASS, duracionDias: 1 };
            expect(operacion({ ...daypass, pagadasDelPlan: [vence('d1', '2026-11-10')] }).tipoOperacion).toBe('COMPRA');
            expect(operacion({ ...daypass, pagadasDelPlan: [vence('d2', HOY)] })).toMatchObject({
                tipoOperacion: 'COMPRA',
                membresiaAnteriorId: null,
                fechaInicio: HOY,
                fechaInicioFija: false,
            });
        });

        it('por defecto empieza hoy', () => {
            expect(operacion({}).fechaInicio).toBe(HOY);
        });
    });

    describe('RENOVACION', () => {
        it.each([TipoPlan.MENSUAL, TipoPlan.SET_CLASES])('%s con una membresía del mismo plan vencida es RENOVACION con la fecha elegida', (tipoPlan) => {
            expect(operacion({ tipoPlan, pagadasDelPlan: [vence('m1', '2026-11-01')], fechaSolicitada: '2026-11-20' })).toEqual({
                tipoOperacion: TipoOperacionMembresia.RENOVACION,
                membresiaAnteriorId: 'm1',
                fechaInicio: '2026-11-20',
                fechaVencimiento: '2026-12-19',
                fechaInicioFija: false,
            });
        });

        it('con una membresía vigente, empieza el día siguiente al vencimiento e ignora la fecha elegida', () => {
            expect(operacion({ pagadasDelPlan: [vence('m1', '2026-11-30')], fechaSolicitada: '2026-11-16' })).toEqual({
                tipoOperacion: TipoOperacionMembresia.RENOVACION,
                membresiaAnteriorId: 'm1',
                fechaInicio: '2026-12-01',
                fechaVencimiento: '2026-12-30',
                fechaInicioFija: true,
            });
        });

        it('si vence hoy sigue vigente: la renovación empieza mañana', () => {
            expect(operacion({ pagadasDelPlan: [vence('m1', HOY)] })).toMatchObject({ fechaInicio: '2026-11-16', fechaInicioFija: true });
        });

        it('la fecha fija no se valida contra los 30 días (aunque el vencimiento esté lejos)', () => {
            expect(operacion({ pagadasDelPlan: [vence('m1', '2027-01-20')], fechaSolicitada: '2020-01-01' }).fechaInicio).toBe('2027-01-21');
        });

        it('renueva la membresía pagada que vence más tarde', () => {
            const pagadas = [vence('vieja', '2026-09-30'), vence('ultima', '2026-11-25'), vence('otra', '2026-10-30')];
            expect(operacion({ pagadasDelPlan: pagadas })).toMatchObject({ membresiaAnteriorId: 'ultima', fechaInicio: '2026-11-26' });
        });
    });

    describe('fecha de inicio', () => {
        it('acepta desde hoy hasta 30 días después', () => {
            expect(operacion({ fechaSolicitada: HOY }).fechaInicio).toBe(HOY);
            expect(operacion({ fechaSolicitada: '2026-12-15' }).fechaInicio).toBe('2026-12-15');
        });

        it.each(['2026-11-14', '2026-12-16'])('rechaza %s con el mensaje del criterio', (fechaSolicitada) => {
            expect(determinarOperacion(base({ fechaSolicitada }))).toEqual({ ok: false, error: FECHA_INICIO_INVALIDA });
        });

        it('también se valida en la renovación de una membresía vencida', () => {
            expect(determinarOperacion(base({ pagadasDelPlan: [vence('m1', '2026-11-01')], fechaSolicitada: '2026-11-10' })))
                .toEqual({ ok: false, error: FECHA_INICIO_INVALIDA });
        });
    });

    describe('fecha de vencimiento', () => {
        it('Daypass vence el mismo día; Mensual y Set, 29 días después del inicio', () => {
            expect(operacion({ tipoPlan: TipoPlan.DAYPASS, duracionDias: 1 }).fechaVencimiento).toBe(HOY);
            expect(operacion({}).fechaVencimiento).toBe('2026-12-14');
            expect(operacion({ tipoPlan: TipoPlan.SET_CLASES, fechaSolicitada: '2026-12-10' }).fechaVencimiento).toBe('2027-01-08');
        });
    });
});
