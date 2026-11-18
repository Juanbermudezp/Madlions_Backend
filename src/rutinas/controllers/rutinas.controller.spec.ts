import { Reflector } from '@nestjs/core';
import { ParseUUIDPipe, type ExecutionContext } from '@nestjs/common';
import { ROLES_KEY } from '@Auth/decorators';
import { RolesGuard } from '@Auth/guards';
import { Rol, type User } from '@PrismaClient';
import { RutinasController } from './rutinas.controller.js';
import type { RutinasService } from '../services/rutinas.service.js';

describe('RutinasController', () => {
  const service = { crear: vi.fn(), listar: vi.fn(), actualizar: vi.fn() };
  const controller = new RutinasController(service as unknown as RutinasService);
  const reflector = new Reflector();
  beforeEach(() => vi.resetAllMocks());

  it.each(['crear', 'listar', 'actualizar'] as const)('%s exige ENTRENADOR con el guard existente', (metodo) => {
    const handler = RutinasController.prototype[metodo];
    expect(reflector.getAllAndOverride(ROLES_KEY, [handler, RutinasController])).toEqual([Rol.ENTRENADOR]);
    for (const rol of Object.values(Rol)) {
      const contexto = { getHandler: () => handler, getClass: () => RutinasController,
        switchToHttp: () => ({ getRequest: () => ({ user: { rol } }) }) } as unknown as ExecutionContext;
      if (rol === Rol.ENTRENADOR) expect(new RolesGuard(reflector).canActivate(contexto)).toBe(true);
      else expect(() => new RolesGuard(reflector).canActivate(contexto)).toThrow('No tienes permiso');
    }
  });
  it('utiliza el usuario autenticado en los tres endpoints', async () => {
    const usuario = { id: 'entrenador-token' } as User;
    const datos = { nombre: 'Rutina', objetivo: 'Fuerza', fechaInicio: '2026-11-18', dias: [], miembroId: 'miembro' };
    await controller.crear(usuario, datos);
    await controller.listar(usuario, { miembroId: 'otro-miembro' });
    await controller.actualizar(usuario, 'rutina', datos);
    expect(service.crear).toHaveBeenCalledWith(usuario.id, datos);
    expect(service.listar).toHaveBeenCalledWith(usuario.id, 'otro-miembro');
    expect(service.actualizar).toHaveBeenCalledWith('rutina', usuario.id, datos);
  });
  it('la validación UUID del parámetro rechaza identificadores inválidos', async () => {
    await expect(new ParseUUIDPipe().transform('invalido', { type: 'param', data: 'id' })).rejects.toThrow();
  });
});
