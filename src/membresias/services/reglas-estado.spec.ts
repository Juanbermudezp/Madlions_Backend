import { EstadoMembresia, TipoPlan } from '@PrismaClient';
import { calcularEstadoMembresia, SIN_MEMBRESIA, type MembresiaParaEstado } from './reglas-estado.js';

const HOY = '2026-11-15';
const d = (dia: string) => new Date(`${dia}T00:00:00Z`);
const pagada = (id: string, inicio: string, vencimiento: string, datos: Partial<MembresiaParaEstado> = {}): MembresiaParaEstado => ({
    id,
    estado: EstadoMembresia.PAGADA,
    nombrePlan: 'Mensual',
    tipoPlan: TipoPlan.MENSUAL,
    cantidadClases: null,
    fechaInicioSolicitada: d(inicio),
    fechaInicio: d(inicio),
    fechaVencimiento: d(vencimiento),
    tiposClaseIds: ['t1'],
    ...datos,
});
const pendiente = (id: string, solicitada: string, datos: Partial<MembresiaParaEstado> = {}): MembresiaParaEstado => ({
    ...pagada(id, solicitada, solicitada, datos),
    estado: EstadoMembresia.PENDIENTE_PAGO,
    fechaInicio: null,
    fechaVencimiento: null,
});
const estado = (m: MembresiaParaEstado[]) => calcularEstadoMembresia(m, HOY);

describe('calcularEstadoMembresia', () => {
    describe('SIN_MEMBRESIA', () => {
        it('nunca tuvo una membresía', () => {
            expect(estado([])).toEqual(SIN_MEMBRESIA);
        });
    });

    describe('VIGENTE', () => {
        it('una pagada cubre hoy con más de 3 días restantes', () => {
            expect(estado([pagada('m1', '2026-11-01', '2026-11-30')])).toEqual({
                estado: 'VIGENTE',
                membresiaId: 'm1',
                plan: 'Mensual',
                tipoPlan: TipoPlan.MENSUAL,
                fechaInicio: '2026-11-01',
                fechaVencimiento: '2026-11-30',
                diasRestantes: 15,
                creditosTotales: null,
                creditosDisponibles: null,
                tiposClaseIds: ['t1'],
                renovacion: null,
            });
        });

        it('el primer día de cobertura ya es VIGENTE', () => {
            expect(estado([pagada('m1', HOY, '2026-12-14')]).estado).toBe('VIGENTE');
        });
    });

    describe('PROXIMA_A_VENCER · límite de 3 días', () => {
        it('con 4 días restantes sigue VIGENTE', () => {
            expect(estado([pagada('m1', '2026-10-21', '2026-11-19')])).toMatchObject({ estado: 'VIGENTE', diasRestantes: 4 });
        });

        it('con 3 días restantes pasa a PROXIMA_A_VENCER', () => {
            expect(estado([pagada('m1', '2026-10-20', '2026-11-18')])).toMatchObject({ estado: 'PROXIMA_A_VENCER', diasRestantes: 3 });
        });

        it.each([2, 1])('con %s días restantes es PROXIMA_A_VENCER', (dias) => {
            const vence = `2026-11-${15 + dias}`;
            expect(estado([pagada('m1', '2026-10-20', vence)])).toMatchObject({ estado: 'PROXIMA_A_VENCER', diasRestantes: dias });
        });

        it('el día del vencimiento (0 días restantes) sigue cubierto: PROXIMA_A_VENCER', () => {
            expect(estado([pagada('m1', '2026-10-17', HOY)])).toMatchObject({ estado: 'PROXIMA_A_VENCER', diasRestantes: 0 });
        });

        it('un Daypass de hoy es PROXIMA_A_VENCER con 0 días', () => {
            expect(estado([pagada('d1', HOY, HOY, { tipoPlan: TipoPlan.DAYPASS, nombrePlan: 'Daypass' })]))
                .toMatchObject({ estado: 'VIGENTE', diasRestantes: 0, tipoPlan: 'DAYPASS' });
        });
    });

    describe('VENCIDA', () => {
        it('el día después del vencimiento ya es VENCIDA, con la última pagada', () => {
            expect(estado([pagada('vieja', '2026-09-01', '2026-09-30'), pagada('ultima', '2026-10-16', '2026-11-14')]))
                .toMatchObject({ estado: 'VENCIDA', membresiaId: 'ultima', fechaVencimiento: '2026-11-14', diasRestantes: null });
        });
    });

    describe('POR_INICIAR', () => {
        it('pagó una que empieza después de hoy', () => {
            expect(estado([pagada('m1', '2026-11-20', '2026-12-19')]))
                .toMatchObject({ estado: 'POR_INICIAR', membresiaId: 'm1', fechaInicio: '2026-11-20', diasRestantes: null });
        });

        it('si hay varias por iniciar, la principal es la que empieza antes', () => {
            expect(estado([pagada('tarde', '2026-12-20', '2027-01-18'), pagada('pronto', '2026-11-20', '2026-12-19')]))
                .toMatchObject({ membresiaId: 'pronto', renovacion: { estado: 'POR_INICIAR', fechaInicio: '2026-12-20' } });
        });
    });

    describe('PENDIENTE_PAGO', () => {
        it('solo tiene una compra sin pagar: fechas solicitadas, sin vencimiento', () => {
            expect(estado([pendiente('p1', '2026-11-20')])).toMatchObject({
                estado: 'PENDIENTE_PAGO',
                membresiaId: 'p1',
                fechaInicio: '2026-11-20',
                fechaVencimiento: null,
                diasRestantes: null,
                renovacion: null,
            });
        });

        it('con una vencida y una renovación sin pagar, el estado es PENDIENTE_PAGO', () => {
            expect(estado([pagada('m1', '2026-09-01', '2026-09-30'), pendiente('p1', HOY)]).estado).toBe('PENDIENTE_PAGO');
        });
    });

    describe('renovación', () => {
        it('VIGENTE con una renovación pendiente de pago', () => {
            expect(estado([pagada('m1', '2026-11-01', '2026-11-30'), pendiente('p1', '2026-12-01')])).toMatchObject({
                estado: 'VIGENTE',
                membresiaId: 'm1',
                renovacion: { estado: 'PENDIENTE_PAGO', fechaInicio: '2026-12-01' },
            });
        });

        it('PROXIMA_A_VENCER con una renovación ya pagada que empieza al día siguiente', () => {
            expect(estado([pagada('m1', '2026-10-18', '2026-11-16'), pagada('m2', '2026-11-17', '2026-12-16')])).toMatchObject({
                estado: 'PROXIMA_A_VENCER',
                membresiaId: 'm1',
                renovacion: { estado: 'POR_INICIAR', fechaInicio: '2026-11-17' },
            });
        });
    });

    describe('créditos y tipos de clase', () => {
        const set = pagada('s1', '2026-11-01', '2026-11-30', {
            tipoPlan: TipoPlan.SET_CLASES,
            nombrePlan: 'Set 10',
            cantidadClases: 10,
            tiposClaseIds: ['t1', 't2'],
        });

        it('créditos disponibles = créditos del set − reservas confirmadas', () => {
            expect(calcularEstadoMembresia([set], HOY, new Map([['s1', 3]]))).toMatchObject({
                creditosTotales: 10,
                creditosDisponibles: 7,
                tiposClaseIds: ['t1', 't2'],
            });
        });

        it('sin reservas, tiene todos los créditos; nunca baja de 0', () => {
            expect(calcularEstadoMembresia([set], HOY)).toMatchObject({ creditosDisponibles: 10 });
            expect(calcularEstadoMembresia([set], HOY, new Map([['s1', 12]]))).toMatchObject({ creditosDisponibles: 0 });
        });

        it('los planes que no son set no tienen créditos', () => {
            expect(estado([pagada('m1', '2026-11-01', '2026-11-30')])).toMatchObject({ creditosTotales: null, creditosDisponibles: null });
        });
    });

    describe('fechas en UTC-6', () => {
        it('la fecha de corte es la que recibe (hoy en El Salvador), no la del servidor', () => {
            const m = [pagada('m1', '2026-10-17', HOY)];
            expect(calcularEstadoMembresia(m, HOY).estado).toBe('PROXIMA_A_VENCER');
            expect(calcularEstadoMembresia(m, '2026-11-16').estado).toBe('VENCIDA');
        });
    });
});
