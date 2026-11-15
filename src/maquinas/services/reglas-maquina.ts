import { Rol } from '@PrismaClient';

/**
 * Quién ve el motivo interno y el usuario del último cambio de estado de una
 * máquina: el administrador y el entrenador, que son los dos roles que pueden
 * cambiarlo (H18, supuesto S13).
 *
 * El miembro y recepción reciben la máquina sin esos campos (H17, criterio 5).
 */
export function puedeVerDatosInternos(rol: Rol): boolean {
    return rol === Rol.ADMINISTRADOR || rol === Rol.ENTRENADOR;
}
