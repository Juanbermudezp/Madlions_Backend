import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '@Auth/guards';
import { Rol } from '@PrismaClient';

type Controlador = abstract new (...args: never[]) => object;

/**
 * Ejecuta el RolesGuard real sobre un método de un controlador, como si la
 * petición viniera de un usuario con `rol`. Devuelve true si el guard deja
 * pasar y false si responde 403 (el frontend lo muestra como "Acceso denegado").
 */
export function puedeEntrar(controlador: Controlador, metodo: string, rol: Rol): boolean {
    const guard = new RolesGuard(new Reflector());
    const handler = (controlador.prototype as Record<string, unknown>)[metodo];
    if (typeof handler !== 'function') {
        throw new Error(`${controlador.name}.${metodo} no existe`);
    }
    const contexto = {
        getHandler: () => handler,
        getClass: () => controlador,
        switchToHttp: () => ({ getRequest: () => ({ user: { sub: 'u1', rol } }) }),
    } as unknown as ExecutionContext;
    try {
        return guard.canActivate(contexto);
    } catch (error) {
        if (error instanceof ForbiddenException) return false;
        throw error;
    }
}

/** Roles que el guard deja pasar en ese método, en el orden del enum. */
export function rolesPermitidos(controlador: Controlador, metodo: string): Rol[] {
    return Object.values(Rol).filter((rol) => puedeEntrar(controlador, metodo, rol));
}
