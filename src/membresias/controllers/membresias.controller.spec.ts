import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '@Auth/decorators';
import { Rol } from '@PrismaClient';
import { MembresiasController } from './membresias.controller.js';

describe('MembresiasController', () => {
    const reflector = new Reflector();
    const rolesDe = (metodo: keyof MembresiasController) =>
        reflector.get<Rol[] | undefined>(ROLES_KEY, MembresiasController.prototype[metodo]);

    it.each(['resumen', 'registrar'] as const)('%s solo lo usa RECEPCION (los demás reciben 403)', (metodo) => {
        expect(rolesDe(metodo)).toEqual([Rol.RECEPCION]);
    });
});
