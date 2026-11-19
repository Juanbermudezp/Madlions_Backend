import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MENSAJE_SIN_PERMISO_KEY, ROLES_KEY } from '../decorators/roles.decorator.js';
import type { RequestWithUser } from '../decorators/current-user.decorator.js';
import type { Rol } from '@PrismaClient';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) { }

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Rol[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!roles || roles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<RequestWithUser>();
    if (!user || !roles.includes(user.rol)) {
      const mensaje = this.reflector.getAllAndOverride<string | undefined>(
        MENSAJE_SIN_PERMISO_KEY,
        [context.getHandler(), context.getClass()],
      );
      throw new ForbiddenException(
        typeof mensaje === 'string' ? mensaje : 'No tienes permiso para realizar esta acción.',
      );
    }

    return true;
  }
}