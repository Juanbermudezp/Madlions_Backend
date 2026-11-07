import { ForbiddenException } from '@nestjs/common';

/**
 * Comprueba que un recurso pertenezca al usuario autenticado.
 *
 * - `ownerId`: el dueño según el recurso LEÍDO DE LA BASE (p. ej. bloque.entrenadorId).
 * - `userId`: el `sub` del token, es decir `@CurrentUser() user` -> `user.id`.
 *
 * Nunca se compara contra un id enviado en el cuerpo o en la URL: ese valor lo
 * controla el cliente y no prueba nada. La URL solo sirve para encontrar el
 * recurso; la pertenencia se decide aquí.
 *
 * @throws {ForbiddenException} 403 si el recurso es de otro usuario.
 */
export function assertOwnership(
  ownerId: string,
  userId: string,
  message = 'No tienes permiso sobre este recurso.',
): void {
  if (ownerId !== userId) {
    throw new ForbiddenException(message);
  }
}