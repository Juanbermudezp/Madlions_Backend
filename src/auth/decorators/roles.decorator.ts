import { SetMetadata } from '@nestjs/common';
import type { Rol } from '@PrismaClient';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: Rol[]) => SetMetadata(ROLES_KEY, roles);