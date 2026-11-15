import { EstadoMembresia } from '@PrismaClient';

/**
 * Estado de la membresía de un miembro, tal como lo ven recepción y el
 * propio miembro.
 *
 * BE-2.4 es la sub-tarea dueña de esta regla: si define otros estados o
 * prioridades, este es el único archivo que cambia.
 */
export const ESTADOS_MEMBRESIA_MIEMBRO = [
    'ACTIVA',
    'PENDIENTE_PAGO',
    'POR_INICIAR',
    'VENCIDA',
    'SIN_MEMBRESIA',
] as const;

export type EstadoMembresiaMiembro = (typeof ESTADOS_MEMBRESIA_MIEMBRO)[number];

export interface ResumenMembresia {
    estado: EstadoMembresiaMiembro;
    /** AAAA-MM-DD de la membresía que define el estado, o null. */
    fechaVencimiento: string | null;
}

interface Vigencia {
    estado: EstadoMembresia;
    fechaInicio: Date | null;
    fechaVencimiento: Date | null;
}

/** Date de una columna DATE (medianoche UTC) -> "AAAA-MM-DD". */
function aDia(fecha: Date): string {
    return fecha.toISOString().slice(0, 10);
}

/**
 * Estado de un miembro a partir de sus membresías. `hoy` va en AAAA-MM-DD,
 * hora de El Salvador. Prioridad:
 *
 * 1. ACTIVA: tiene una membresía pagada que cubre hoy.
 * 2. PENDIENTE_PAGO: tiene una compra o renovación sin pagar.
 * 3. POR_INICIAR: pagó una membresía que empieza después de hoy.
 * 4. VENCIDA: todas sus membresías pagadas ya terminaron.
 * 5. SIN_MEMBRESIA: nunca tuvo una.
 */
export function calcularEstadoMembresia(membresias: Vigencia[], hoy: string): ResumenMembresia {
    const pagadas = membresias
        .filter((m) => m.estado === EstadoMembresia.PAGADA && m.fechaInicio && m.fechaVencimiento)
        .map((m) => ({ inicio: aDia(m.fechaInicio!), vencimiento: aDia(m.fechaVencimiento!) }))
        .sort((a, b) => b.vencimiento.localeCompare(a.vencimiento));

    const vigente = pagadas.find((m) => m.inicio <= hoy && hoy <= m.vencimiento);
    if (vigente) return { estado: 'ACTIVA', fechaVencimiento: vigente.vencimiento };

    const ultima = pagadas[0];
    if (membresias.some((m) => m.estado === EstadoMembresia.PENDIENTE_PAGO)) {
        return { estado: 'PENDIENTE_PAGO', fechaVencimiento: ultima?.vencimiento ?? null };
    }

    const futura = [...pagadas].reverse().find((m) => m.inicio > hoy);
    if (futura) return { estado: 'POR_INICIAR', fechaVencimiento: futura.vencimiento };

    if (ultima) return { estado: 'VENCIDA', fechaVencimiento: ultima.vencimiento };

    return { estado: 'SIN_MEMBRESIA', fechaVencimiento: null };
}
