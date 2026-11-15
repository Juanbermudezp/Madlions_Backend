import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '@Auth/decorators';
import type { MiembrosService } from '@Miembros/services';
import { Rol, type User } from '@PrismaClient';
import { MiembrosController } from './miembros.controller.js';

describe('MiembrosController', () => {
    it('buscar solo lo usan RECEPCION, ADMINISTRADOR y ENTRENADOR (MIEMBRO recibe 403)', () => {
        const roles = new Reflector().get<Rol[]>(ROLES_KEY, MiembrosController.prototype.buscar);
        expect([...roles].sort()).toEqual([Rol.ADMINISTRADOR, Rol.ENTRENADOR, Rol.RECEPCION].sort());
        expect(roles).not.toContain(Rol.MIEMBRO);
    });

    it('pasa el texto y el rol del usuario al servicio', async () => {
        const service = { buscar: vi.fn().mockResolvedValue([]) };
        const controller = new MiembrosController(service as unknown as MiembrosService);
        await controller.buscar({ q: 'maria' }, { rol: Rol.ENTRENADOR } as User);
        expect(service.buscar).toHaveBeenCalledWith('maria', Rol.ENTRENADOR);
    });
});
