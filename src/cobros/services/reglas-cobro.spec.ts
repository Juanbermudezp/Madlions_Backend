import { EstadoCobro } from '@PrismaClient';
import { estaHabilitado } from './reglas-cobro.js';

const HOY = '2026-11-15';
const d = (dia: string) => new Date(`${dia}T00:00:00Z`);

describe('estaHabilitado', () => {
    it('un cobro pendiente sin fecha (compra o sesión) se puede pagar', () => {
        expect(estaHabilitado({ estado: EstadoCobro.PENDIENTE, habilitadoDesde: null }, HOY)).toBe(true);
    });

    it('una renovación se puede pagar desde el día del vencimiento, no antes', () => {
        expect(estaHabilitado({ estado: EstadoCobro.PENDIENTE, habilitadoDesde: d('2026-11-16') }, HOY)).toBe(false);
        expect(estaHabilitado({ estado: EstadoCobro.PENDIENTE, habilitadoDesde: d(HOY) }, HOY)).toBe(true);
        expect(estaHabilitado({ estado: EstadoCobro.PENDIENTE, habilitadoDesde: d('2026-11-01') }, HOY)).toBe(true);
    });

    it('un cobro pagado nunca está habilitado para pagar', () => {
        expect(estaHabilitado({ estado: EstadoCobro.PAGADO, habilitadoDesde: null }, HOY)).toBe(false);
    });

    it('usa el día de El Salvador que recibe, no el del servidor', () => {
        const cobro = { estado: EstadoCobro.PENDIENTE, habilitadoDesde: d('2026-11-16') };
        expect(estaHabilitado(cobro, '2026-11-15')).toBe(false);
        expect(estaHabilitado(cobro, '2026-11-16')).toBe(true);
    });
});
