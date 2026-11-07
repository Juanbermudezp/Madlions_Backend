import { UnauthorizedException } from '@nestjs/common';
import type { UsersService } from '@Users/services';
import { Rol, type User } from '@PrismaClient';
import { AuthService } from './auth.service.js';
import type { TokenService } from './token.service.js';

const usuario = {
  id: 'u1',
  email: 'inactivo@madlions.com',
  passwordHash: 'hash',
  rol: Rol.MIEMBRO,
} as User;

describe('AuthService', () => {
  const usersService = { findByEmail: vi.fn(), verifyPassword: vi.fn() };
  const tokenService = { issueTokenPair: vi.fn() };
  const service = new AuthService(
    usersService as unknown as UsersService,
    tokenService as unknown as TokenService,
  );
  const credenciales = { email: 'inactivo@madlions.com', password: 'Demo1234!' };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('rechaza con 401 a una cuenta inactiva aunque la contraseña sea correcta', async () => {
    usersService.findByEmail.mockResolvedValue({ ...usuario, isActive: false });
    usersService.verifyPassword.mockResolvedValue(true);

    await expect(service.login(credenciales)).rejects.toThrow(UnauthorizedException);
    expect(tokenService.issueTokenPair).not.toHaveBeenCalled();
  });

  it('emite tokens a una cuenta activa con credenciales correctas', async () => {
    usersService.findByEmail.mockResolvedValue({ ...usuario, isActive: true });
    usersService.verifyPassword.mockResolvedValue(true);
    tokenService.issueTokenPair.mockResolvedValue({ accessToken: 'a' });

    await expect(service.login(credenciales)).resolves.toMatchObject({
      tokens: { accessToken: 'a' },
    });
  });
});