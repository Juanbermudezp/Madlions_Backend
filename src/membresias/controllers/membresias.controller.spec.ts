import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '@Auth/decorators';
import type { MembresiasService, RegistroMembresiaService } from '@Membresias/services';
import { Rol, type User } from '@PrismaClient';
import { MembresiasController } from './membresias.controller.js';

describe('MembresiasController', () => {
    const reflector = new Reflector();
    const rolesDe = (metodo: keyof MembresiasController) =>
        reflector.get<Rol[] | undefined>(ROLES_KEY, MembresiasController.prototype[metodo]);

    it.each(['resumen', 'registrar'] as const)('%s solo lo usa RECEPCION (los demás reciben 403)', (metodo) => {
        expect(rolesDe(metodo)).toEqual([Rol.RECEPCION]);
    });

    it.each(['obtenerMia', 'obtenerUna'] as const)('%s solo lo usa MIEMBRO (los demás reciben 403)', (metodo) => {
        expect(rolesDe(metodo)).toEqual([Rol.MIEMBRO]);
    });

    it('GET /membresias/mia no recibe ningún id: usa solo el usuario del token', async () => {
        const membresias = { obtenerMiEstado: vi.fn().mockResolvedValue({ estado: 'SIN_MEMBRESIA' }) };
        const controller = new MembresiasController(
            {} as RegistroMembresiaService,
            membresias as unknown as MembresiasService,
        );
        const metodo: keyof MembresiasController = 'obtenerMia';
        expect(MembresiasController.prototype[metodo]).toHaveLength(1);
        await controller.obtenerMia({ id: 'u1', rol: Rol.MIEMBRO } as User);
        expect(membresias.obtenerMiEstado).toHaveBeenCalledWith('u1');
    });
});
