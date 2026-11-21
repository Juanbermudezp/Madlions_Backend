import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { JwtService } from '@nestjs/jwt';
import type { UsersService } from '@Users/services';
import { Rol, type User } from '@PrismaClient';
import { JwtAuthGuard } from './jwt-auth.guard.js';

function crearContexto(authorization?: string) {
  const request: { headers: { authorization?: string }; user?: User } = {
    headers: { authorization },
  };
  const context = {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

const entrenador = {
  id: 'u1',
  email: 'entrenador@madlions.com',
  rol: Rol.ENTRENADOR,
  isActive: true,
} as User;

describe('JwtAuthGuard', () => {
  const reflector = new Reflector();
  const jwtService = { verifyAsync: vi.fn() };
  const usersService = { findById: vi.fn() };
  const guard = new JwtAuthGuard(
    reflector,
    jwtService as unknown as JwtService,
    usersService as unknown as UsersService,
  );

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
  });

  it('responde 401 si no hay token', async () => {
    await expect(guard.canActivate(crearContexto().context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('responde 401 si el token es inválido o expiró', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));
    await expect(
      guard.canActivate(crearContexto('Bearer token-malo').context),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('responde 401 si la cuenta está inactiva', async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: 'u1', rol: Rol.ENTRENADOR });
    usersService.findById.mockResolvedValue({ ...entrenador, isActive: false });
    await expect(
      guard.canActivate(crearContexto('Bearer token-bueno').context),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('carga el usuario desde la base con el sub, no con el rol del token', async () => {
    // El token dice MIEMBRO, pero la base dice ENTRENADOR: manda la base.
    jwtService.verifyAsync.mockResolvedValue({ sub: 'u1', rol: Rol.MIEMBRO });
    usersService.findById.mockResolvedValue(entrenador);
    const { context, request } = crearContexto('Bearer token-bueno');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(usersService.findById).toHaveBeenCalledWith('u1');
    expect(request.user?.rol).toBe(Rol.ENTRENADOR);
  });
});