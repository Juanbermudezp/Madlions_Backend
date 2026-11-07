import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Rol, type User } from '@PrismaClient';
import { RolesGuard } from './roles.guard.js';

function crearContexto(user?: Partial<User>): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deja pasar si la ruta no pide roles', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(crearContexto({ rol: Rol.MIEMBRO }))).toBe(true);
  });

  it('deja pasar al usuario que tiene el rol pedido', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Rol.ENTRENADOR]);
    expect(guard.canActivate(crearContexto({ rol: Rol.ENTRENADOR }))).toBe(true);
  });

  it.each([Rol.MIEMBRO, Rol.RECEPCION, Rol.ADMINISTRADOR])(
    'rechaza con 403 al rol %s en una ruta de entrenador',
    (rol) => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Rol.ENTRENADOR]);
      expect(() => guard.canActivate(crearContexto({ rol }))).toThrow(
        ForbiddenException,
      );
    },
  );

  it('rechaza si no hay usuario en el request', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Rol.ENTRENADOR]);
    expect(() => guard.canActivate(crearContexto())).toThrow(ForbiddenException);
  });
});