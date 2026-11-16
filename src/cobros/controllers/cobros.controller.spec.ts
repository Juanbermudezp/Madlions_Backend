import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '@Auth/decorators';
import type { CobrosService } from '@Cobros/services';
import { Rol, type User } from '@PrismaClient';
import { CobrosController } from './cobros.controller.js';

describe('CobrosController', () => {
    it('GET /cobros/mios solo lo usa MIEMBRO (los demás reciben 403)', () => {
        const metodo: keyof CobrosController = 'listarMios';
        expect(new Reflector().get(ROLES_KEY, CobrosController.prototype[metodo])).toEqual([Rol.MIEMBRO]);
    });

    it('filtra con el usuario del token y el estado pedido', async () => {
        const service = { listarMios: vi.fn().mockResolvedValue([]) };
        const controller = new CobrosController(service as unknown as CobrosService);
        await controller.listarMios({ estado: 'PAGADO' }, { id: 'u1', rol: Rol.MIEMBRO } as User);
        expect(service.listarMios).toHaveBeenCalledWith('u1', 'PAGADO');
    });
});
