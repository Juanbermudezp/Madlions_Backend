import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '@Auth/decorators';
import { Rol } from '@PrismaClient';
import { ComprobantesController } from './comprobantes.controller.js';

describe('ComprobantesController', () => {
    it('GET /comprobantes/:numero lo usan MIEMBRO y ADMINISTRADOR (recepción y entrenador reciben 403)', () => {
        const metodo: keyof ComprobantesController = 'obtener';
        const roles = new Reflector().get<Rol[]>(ROLES_KEY, ComprobantesController.prototype[metodo]);
        expect([...roles].sort()).toEqual([Rol.ADMINISTRADOR, Rol.MIEMBRO]);
    });
});
