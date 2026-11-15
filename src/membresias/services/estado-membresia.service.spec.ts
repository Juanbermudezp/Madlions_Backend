import type { MembresiaRepository } from '@Membresias/repositories';
import { EstadoMembresia, TipoPlan } from '@PrismaClient';
import { EstadoMembresiaService } from './estado-membresia.service.js';

const d = (dia: string) => new Date(`${dia}T00:00:00Z`);
const fila = (id: string, miembroId: string, datos: Record<string, unknown> = {}) => ({
    id,
    miembroId,
    estado: EstadoMembresia.PAGADA,
    nombrePlan: 'Mensual',
    tipoPlan: TipoPlan.MENSUAL,
    cantidadClases: null,
    fechaInicioSolicitada: d('2026-11-01'),
    fechaInicio: d('2026-11-01'),
    fechaVencimiento: d('2026-11-30'),
    tiposClaseIds: [],
    ...datos,
});

describe('EstadoMembresiaService', () => {
    const repo = { findParaEstado: vi.fn(), contarReservasConfirmadas: vi.fn() };
    const service = new EstadoMembresiaService(repo as unknown as MembresiaRepository);

    beforeEach(() => {
        vi.resetAllMocks();
        repo.contarReservasConfirmadas.mockResolvedValue(new Map());
    });

    it('calcula el estado de varios miembros con una sola consulta de membresías', async () => {
        repo.findParaEstado.mockResolvedValue([
            fila('a', 'm1'),
            fila('b', 'm2', { estado: EstadoMembresia.PENDIENTE_PAGO, fechaInicio: null, fechaVencimiento: null }),
        ]);

        const estados = await service.estadosDe(['m1', 'm2', 'm3'], '2026-11-15');

        expect(repo.findParaEstado).toHaveBeenCalledTimes(1);
        expect(estados.get('m1')?.estado).toBe('VIGENTE');
        expect(estados.get('m2')?.estado).toBe('PENDIENTE_PAGO');
        expect(estados.get('m3')?.estado).toBe('SIN_MEMBRESIA');
    });

    it('descuenta las reservas confirmadas de los sets', async () => {
        repo.findParaEstado.mockResolvedValue([fila('s1', 'm1', { tipoPlan: TipoPlan.SET_CLASES, cantidadClases: 8 })]);
        repo.contarReservasConfirmadas.mockResolvedValue(new Map([['s1', 2]]));

        const estado = await service.obtenerEstado('m1', '2026-11-15');

        expect(repo.contarReservasConfirmadas).toHaveBeenCalledWith(['s1']);
        expect(estado).toMatchObject({ creditosTotales: 8, creditosDisponibles: 6 });
    });
});
