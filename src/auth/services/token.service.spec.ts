import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { RefreshTokenRepository } from '@Auth/repositories';
import type { EnvConfig } from '@Config';
import { validateEnv } from '@Config';
import { Rol, type User } from '@PrismaClient';
import { TokenService } from './token.service.js';

describe('TokenService', () => {
  it('emite un token con sub y rol que expira a las 8 horas', async () => {
    // Se usa el mismo valor por defecto que lee la app al arrancar.
    const env = validateEnv({ DATABASE_URL: 'x', JWT_SECRET: 's'.repeat(32) });
    expect(env.JWT_EXPIRES_IN).toBe('8h');

    const jwtService = new JwtService({
      secret: env.JWT_SECRET,
      signOptions: { expiresIn: '8h', algorithm: 'HS256' },
    });
    const refreshTokenRepository = { create: vi.fn() };
    const configService = { get: vi.fn().mockReturnValue(7) };
    const service = new TokenService(
      refreshTokenRepository as unknown as RefreshTokenRepository,
      jwtService,
      configService as unknown as ConfigService<EnvConfig, true>,
    );

    const usuario = { id: 'u1', email: 'e@madlions.com', rol: Rol.ENTRENADOR } as User;
    const tokens = await service.issueTokenPair(usuario);
    const payload = jwtService.decode<{ sub: string; rol: Rol }>(tokens.accessToken);

    expect(payload.sub).toBe('u1');
    expect(payload.rol).toBe(Rol.ENTRENADOR);
    expect(tokens.expiresIn).toBe(8 * 60 * 60);
  });
});