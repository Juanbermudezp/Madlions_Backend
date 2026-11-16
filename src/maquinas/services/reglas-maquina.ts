import { Rol } from '@PrismaClient';

// Quién ve el motivo interno y el usuario del último cambio de estado de una máquina.
export function puedeVerDatosInternos(rol: Rol): boolean {
    return rol === Rol.ADMINISTRADOR || rol === Rol.ENTRENADOR;
}
