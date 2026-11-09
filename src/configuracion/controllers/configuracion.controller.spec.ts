import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '@Auth/decorators';
import { Rol } from '@PrismaClient';
import { ConfiguracionController } from './configuracion.controller.js';

describe('ConfiguracionController', () => {
    const reflector = new Reflector();
    const rolesDe = (metodo: keyof ConfiguracionController) =>
        reflector.get<Rol[] | undefined>(ROLES_KEY, ConfiguracionController.prototype[metodo]);

    it('GET precio-clase-puntual no restringe roles', () => {
        expect(rolesDe('consultarPrecioClasePuntual')).toBeUndefined();
    });

    it('PUT precio-clase-puntual solo lo puede usar el ADMINISTRADOR (RolesGuard responde 403)', () => {
        expect(rolesDe('actualizarPrecioClasePuntual')).toEqual([Rol.ADMINISTRADOR]);
    });
});
