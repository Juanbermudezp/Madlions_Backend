import { ZONA_HORARIA } from '@Common/fechas';
import { ANTICIPACION_MINIMA_HORAS } from '@Entrenadores/services';
import type { EstadoMembresiaMiembro } from '@Membresias/services';

/** Máximo de sesiones agendadas que todavía no empiezan (H9). */
export const MAX_SESIONES_PENDIENTES = 5;

const ESTADOS_QUE_PERMITEN_AGENDAR: readonly EstadoMembresiaMiembro[] = [
    'VIGENTE',
    'PROXIMA_A_VENCER',
];

/** El bloque debe empezar dentro de 2 horas o más. */
export function cumpleAnticipacion(inicio: Date, ahora: Date): boolean {
    return inicio.getTime() - ahora.getTime() >= ANTICIPACION_MINIMA_HORAS * 60 * 60 * 1000;
}

/**
 * La membresía tiene que estar Vigente o Próxima a vencer hoy y también en
 * la fecha de la sesión (es decir, cubrir esa fecha). Una renovación ya
 * pagada que empieza antes de la sesión también la cubre.
 */
export function membresiaPermiteAgendar(
    estadoHoy: EstadoMembresiaMiembro,
    estadoEnFechaSesion: EstadoMembresiaMiembro,
): boolean {
    return (
        ESTADOS_QUE_PERMITEN_AGENDAR.includes(estadoHoy) &&
        ESTADOS_QUE_PERMITEN_AGENDAR.includes(estadoEnFechaSesion)
    );
}

/** Detalle del cobro: "Sesión con Carlos Martínez el 17/11/2026, 07:00". */
export function detalleCobroSesion(entrenador: string, inicio: Date): string {
    const fecha = new Intl.DateTimeFormat('es-SV', {
        timeZone: ZONA_HORARIA,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).format(inicio);
    return `Sesión con ${entrenador} el ${fecha}`.slice(0, 150);
}