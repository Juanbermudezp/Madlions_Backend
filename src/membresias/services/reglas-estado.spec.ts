import { EstadoMembresia } from '@PrismaClient';
import { calcularEstadoMembresia } from './reglas-estado.js';

const HOY = '2026-11-15';
const d = (dia: string) => new Date(`${dia}T00:00:00Z`);
const pagada = (inicio: string, vencimiento: string) => ({
    estado: EstadoMembresia.PAGADA,
    fechaInicio: d(inicio),
    fechaVencimiento: d(vencimiento),
});
const pendiente = { estado: EstadoMembresia.PENDIENTE_PAGO, fechaInicio: null, fechaVencimiento: null };

describe('calcularEstadoMembresia', () => {
    it('SIN_MEMBRESIA si nunca tuvo una', () => {
        expect(calcularEstadoMembresia([], HOY)).toEqual({ estado: 'SIN_MEMBRESIA', fechaVencimiento: null });
    });

    it('ACTIVA si una pagada cubre hoy, incluidos el primer y el último día', () => {
        expect(calcularEstadoMembresia([pagada('2026-11-01', '2026-11-30')], HOY))
            .toEqual({ estado: 'ACTIVA', fechaVencimiento: '2026-11-30' });
        expect(calcularEstadoMembresia([pagada(HOY, '2026-12-14')], HOY).estado).toBe('ACTIVA');
        expect(calcularEstadoMembresia([pagada('2026-10-17', HOY)], HOY).estado).toBe('ACTIVA');
    });

    it('ACTIVA tiene prioridad sobre una renovación pendiente de pago', () => {
        expect(calcularEstadoMembresia([pagada('2026-11-01', '2026-11-30'), pendiente], HOY).estado).toBe('ACTIVA');
    });

    it('PENDIENTE_PAGO si no tiene una vigente y hay una sin pagar', () => {
        expect(calcularEstadoMembresia([pendiente], HOY)).toEqual({ estado: 'PENDIENTE_PAGO', fechaVencimiento: null });
        expect(calcularEstadoMembresia([pagada('2026-10-01', '2026-10-30'), pendiente], HOY))
            .toEqual({ estado: 'PENDIENTE_PAGO', fechaVencimiento: '2026-10-30' });
    });

    it('POR_INICIAR si pagó una que empieza después de hoy', () => {
        expect(calcularEstadoMembresia([pagada('2026-11-20', '2026-12-19')], HOY))
            .toEqual({ estado: 'POR_INICIAR', fechaVencimiento: '2026-12-19' });
    });

    it('VENCIDA con la fecha de la última membresía pagada', () => {
        expect(calcularEstadoMembresia([pagada('2026-09-01', '2026-09-30'), pagada('2026-10-01', '2026-10-30')], HOY))
            .toEqual({ estado: 'VENCIDA', fechaVencimiento: '2026-10-30' });
        expect(calcularEstadoMembresia([pagada('2026-11-14', '2026-11-14')], HOY).estado).toBe('VENCIDA');
    });
});
