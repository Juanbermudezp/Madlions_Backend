import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '@Auth/decorators';
import type { PlanesService } from '@Planes/services';
import { Rol, type User } from '@PrismaClient';
import { PlanesController } from './planes.controller.js';

describe('PlanesController', () => {
    const reflector = new Reflector();
    const rolesDe = (metodo: keyof PlanesController) =>
        reflector.get<Rol[] | undefined>(ROLES_KEY, PlanesController.prototype[metodo]);

    describe('control de acceso (RolesGuard responde 403 a los demás roles)', () => {
        it('GET /planes no restringe roles', () => {
            expect(rolesDe('listar')).toBeUndefined();
        });

        it.each(['crear', 'actualizar', 'desactivar'] as const)(
            '%s solo lo puede usar el ADMINISTRADOR',
            (metodo) => {
                expect(rolesDe(metodo)).toEqual([Rol.ADMINISTRADOR]);
            },
        );
    });

    it('listar pasa el rol del usuario al servicio', async () => {
        const service = { listar: vi.fn().mockResolvedValue([]) };
        const controller = new PlanesController(service as unknown as PlanesService);

        await controller.listar({ rol: Rol.MIEMBRO } as User);

        expect(service.listar).toHaveBeenCalledWith(Rol.MIEMBRO);
    });
});
