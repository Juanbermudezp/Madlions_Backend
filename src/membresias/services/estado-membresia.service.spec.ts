import type { MembresiaRepository } from '@Membresias/repositories';
import { EstadoMembresia } from '@PrismaClient';
import { EstadoMembresiaService } from './estado-membresia.service.js';

describe('EstadoMembresiaService', () => {
    const repo = { findVigenciasDe: vi.fn() };
    const service = new EstadoMembresiaService(repo as unknown as MembresiaRepository);

    beforeEach(() => vi.resetAllMocks());

    it('calcula el estado de cada miembro con una sola consulta', async () => {
        repo.findVigenciasDe.mockResolvedValue([
            {
                miembroId: 'm1',
                estado: EstadoMembresia.PAGADA,
                fechaInicio: new Date('2026-11-01T00:00:00Z'),
                fechaVencimiento: new Date('2026-11-30T00:00:00Z'),
            },
            { miembroId: 'm2', estado: EstadoMembresia.PENDIENTE_PAGO, fechaInicio: null, fechaVencimiento: null },
        ]);

        const estados = await service.estadosDe(['m1', 'm2', 'm3'], '2026-11-15');

        expect(repo.findVigenciasDe).toHaveBeenCalledTimes(1);
        expect(repo.findVigenciasDe).toHaveBeenCalledWith(['m1', 'm2', 'm3']);
        expect(estados.get('m1')).toEqual({ estado: 'ACTIVA', fechaVencimiento: '2026-11-30' });
        expect(estados.get('m2')).toEqual({ estado: 'PENDIENTE_PAGO', fechaVencimiento: null });
        expect(estados.get('m3')).toEqual({ estado: 'SIN_MEMBRESIA', fechaVencimiento: null });
    });
});
