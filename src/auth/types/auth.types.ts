import type { Rol } from '@PrismaClient';
export interface AccessTokenPayload {
  sub: string;
  email: string;
  rol: Rol;
}
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}