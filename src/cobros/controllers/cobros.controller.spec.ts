import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '@Auth/decorators';
import type { CobrosService, PagosService } from '@Cobros/services';
import { Rol, type User } from '@PrismaClient';
import { CobrosController } from './cobros.controller.js';

describe('CobrosController', () => {
    it.each(['listarMios', 'pagar'] as const)('%s solo lo usa MIEMBRO (los demás reciben 403)', (metodo) => {
        expect(new Reflector().get(ROLES_KEY, CobrosController.prototype[metodo])).toEqual([Rol.MIEMBRO]);
    });

    it('pagar usa el usuario del token', async () => {
        const pagos = { pagar: vi.fn().mockResolvedValue({ resultado: 'APROBADO' }) };
        const controller = new CobrosController({} as CobrosService, pagos as unknown as PagosService);
        const tarjeta = { titular: 'María López', numero: '4242424242424242', vencimiento: '12/30', cvv: '123' };
        await controller.pagar('c1', tarjeta, { id: 'u1', rol: Rol.MIEMBRO } as User);
        expect(pagos.pagar).toHaveBeenCalledWith('c1', 'u1', tarjeta);
    });

    it('filtra con el usuario del token y el estado pedido', async () => {
        const service = { listarMios: vi.fn().mockResolvedValue([]) };
        const controller = new CobrosController(service as unknown as CobrosService, {} as PagosService);
        await controller.listarMios({ estado: 'PAGADO' }, { id: 'u1', rol: Rol.MIEMBRO } as User);
        expect(service.listarMios).toHaveBeenCalledWith('u1', 'PAGADO');
    });
});
