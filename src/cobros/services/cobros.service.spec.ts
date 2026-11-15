import type { CobroRepository } from '@Cobros/repositories';
import { ConceptoCobro, ReferenciaCobro } from '@PrismaClient';
import { CobrosService } from './cobros.service.js';

describe('CobrosService.crearCobro', () => {
    it('crea el cobro dentro de la transacción de quien lo pide', async () => {
        const repo = { create: vi.fn().mockResolvedValue({ id: 'c1' }) };
        const service = new CobrosService(repo as unknown as CobroRepository);
        const datos = {
            miembroId: 'm1',
            concepto: ConceptoCobro.MEMBRESIA,
            monto: 35.5,
            referenciaTipo: ReferenciaCobro.MEMBRESIA,
            referenciaId: 'mem1',
        };
        const tx = {} as never;

        await expect(service.crearCobro(datos, tx)).resolves.toEqual({ id: 'c1' });
        expect(repo.create).toHaveBeenCalledWith(datos, tx);
    });
});
