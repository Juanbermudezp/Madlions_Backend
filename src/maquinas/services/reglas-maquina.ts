import { EstadoMaquina, Rol } from '@PrismaClient';

// Quién ve el motivo interno y el usuario del último cambio de estado de una máquina.
export function puedeVerDatosInternos(rol: Rol): boolean {
    return rol === Rol.ADMINISTRADOR || rol === Rol.ENTRENADOR;
}

export const FECHA_RETORNO_PASADA =
    'La fecha estimada de retorno no puede ser anterior a hoy.';
export const FECHA_RETORNO_EN_OPERATIVA =
    'Una máquina que vuelve a estar operativa no lleva fecha estimada de retorno.';

// Un cambio de estado tiene que cambiar el estado (H18, criterio 4).
export function esMismoEstado(actual: EstadoMaquina, nuevo: EstadoMaquina): boolean {
    return actual === nuevo;
}

/**
 * Mensaje de error de la fecha estimada de retorno, o null si está bien
 * (H18, criterio 4). `hoy` y `fecha` son AAAA-MM-DD en hora de El Salvador,
 * así que se comparan como texto.
 */
export function errorDeFechaEstimada(
    estadoNuevo: EstadoMaquina,
    fecha: string | undefined,
    hoy: string,
): string | null {
    if (fecha === undefined) return null;
    if (estadoNuevo === EstadoMaquina.OPERATIVA) return FECHA_RETORNO_EN_OPERATIVA;
    return fecha < hoy ? FECHA_RETORNO_PASADA : null;
}

/**
 * Fecha estimada con la que queda la máquina (H18, criterio 2): al volver a
 * OPERATIVA se borra, porque ya retornó.
 */
export function fechaEstimadaTrasElCambio(
    estadoNuevo: EstadoMaquina,
    fecha: string | undefined,
): Date | null {
    if (estadoNuevo === EstadoMaquina.OPERATIVA || fecha === undefined) return null;
    return new Date(`${fecha}T00:00:00Z`);
}
