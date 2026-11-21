import { EstadoMembresia, TipoPlan } from '@PrismaClient';

/**
 * Estado de la membresía de un miembro (BE-2.4), tal como lo usan los
 * módulos 2, 3, 4 y 9. Todas las reglas viven en este archivo.
 */
export const ESTADOS_MEMBRESIA_MIEMBRO = [
    'PENDIENTE_PAGO',
    'POR_INICIAR',
    'VIGENTE',
    'PROXIMA_A_VENCER',
    'VENCIDA',
    'SIN_MEMBRESIA',
] as const;

export type EstadoMembresiaMiembro = (typeof ESTADOS_MEMBRESIA_MIEMBRO)[number];

/** Con este número de días restantes o menos, una membresía vigente pasa a PROXIMA_A_VENCER. */
export const DIAS_PROXIMA_A_VENCER = 3;

/** Membresía con los datos necesarios para calcular el estado. */
export interface MembresiaParaEstado {
    id: string;
    estado: EstadoMembresia;
    nombrePlan: string;
    tipoPlan: TipoPlan;
    cantidadClases: number | null;
    fechaInicioSolicitada: Date;
    fechaInicio: Date | null;
    fechaVencimiento: Date | null;
    tiposClaseIds: string[];
}

/** Compra o renovación posterior a la membresía principal. */
export interface RenovacionPendiente {
    estado: 'PENDIENTE_PAGO' | 'POR_INICIAR';
    /** AAAA-MM-DD: la fecha de inicio pagada, o la solicitada si falta pagar. */
    fechaInicio: string;
}

/** Respuesta de MembresiasService.obtenerEstado(). Fechas en AAAA-MM-DD. */
export interface EstadoMembresiaDetalle {
    estado: EstadoMembresiaMiembro;
    membresiaId: string | null;
    plan: string | null;
    tipoPlan: TipoPlan | null;
    fechaInicio: string | null;
    fechaVencimiento: string | null;
    /** Días que faltan para el vencimiento (0 = vence hoy). Solo en VIGENTE y PROXIMA_A_VENCER. */
    diasRestantes: number | null;
    /** Clases del set; null si no es Set de clases mensual. */
    creditosTotales: number | null;
    /** Créditos del set − reservas confirmadas de esa membresía; null si no es set. */
    creditosDisponibles: number | null;
    /** Tipos de clase incluidos; null en SIN_MEMBRESIA. */
    tiposClaseIds: string[] | null;
    renovacion: RenovacionPendiente | null;
}

export const SIN_MEMBRESIA: EstadoMembresiaDetalle = {
    estado: 'SIN_MEMBRESIA',
    membresiaId: null,
    plan: null,
    tipoPlan: null,
    fechaInicio: null,
    fechaVencimiento: null,
    diasRestantes: null,
    creditosTotales: null,
    creditosDisponibles: null,
    tiposClaseIds: null,
    renovacion: null,
};

const DIA_MS = 24 * 60 * 60 * 1000;

/** Date de una columna DATE (medianoche UTC) -> "AAAA-MM-DD". */
function aDia(fecha: Date): string {
    return fecha.toISOString().slice(0, 10);
}

function diasEntre(desde: string, hasta: string): number {
    return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / DIA_MS);
}

interface Pagada {
    membresia: MembresiaParaEstado;
    inicio: string;
    vencimiento: string;
}

/**
 * Estado de un miembro en una fecha (AAAA-MM-DD, hora de El Salvador).
 *
 * Membresía principal, en este orden:
 * 1. Una PAGADA que cubre la fecha (inicio ≤ fecha ≤ vencimiento):
 *    VIGENTE, o PROXIMA_A_VENCER si le quedan 3 días o menos.
 * 2. La PAGADA más próxima que empieza después de la fecha: POR_INICIAR.
 * 3. Una compra o renovación sin pagar: PENDIENTE_PAGO.
 * 4. La última PAGADA, ya terminada: VENCIDA.
 * 5. Ninguna: SIN_MEMBRESIA.
 *
 * Si la principal está VIGENTE, PROXIMA_A_VENCER o POR_INICIAR y hay otra
 * posterior (pagada por iniciar o pendiente de pago), esa va en `renovacion`.
 *
 * @param reservasConfirmadas reservas CONFIRMADA por id de membresía (H5).
 */
export function calcularEstadoMembresia(
    membresias: MembresiaParaEstado[],
    fecha: string,
    reservasConfirmadas: ReadonlyMap<string, number> = new Map(),
): EstadoMembresiaDetalle {
    const pagadas: Pagada[] = membresias
        .filter((m) => m.estado === EstadoMembresia.PAGADA && m.fechaInicio && m.fechaVencimiento)
        .map((m) => ({ membresia: m, inicio: aDia(m.fechaInicio!), vencimiento: aDia(m.fechaVencimiento!) }));
    const pendiente = membresias.find((m) => m.estado === EstadoMembresia.PENDIENTE_PAGO);

    const vigente = pagadas
        .filter((p) => p.inicio <= fecha && fecha <= p.vencimiento)
        .sort((a, b) => b.vencimiento.localeCompare(a.vencimiento))[0];
    const futuras = pagadas
        .filter((p) => p.inicio > fecha)
        .sort((a, b) => a.inicio.localeCompare(b.inicio));

    const detalle = (
        estado: EstadoMembresiaMiembro,
        m: MembresiaParaEstado,
        fechas: { inicio: string; vencimiento: string | null },
        diasRestantes: number | null,
        renovacion: RenovacionPendiente | null,
    ): EstadoMembresiaDetalle => {
        const esSet = m.tipoPlan === TipoPlan.SET_CLASES && m.cantidadClases !== null;
        return {
            estado,
            membresiaId: m.id,
            plan: m.nombrePlan,
            tipoPlan: m.tipoPlan,
            fechaInicio: fechas.inicio,
            fechaVencimiento: fechas.vencimiento,
            diasRestantes,
            creditosTotales: esSet ? m.cantidadClases : null,
            creditosDisponibles: esSet
                ? Math.max(0, m.cantidadClases! - (reservasConfirmadas.get(m.id) ?? 0))
                : null,
            tiposClaseIds: m.tiposClaseIds,
            renovacion,
        };
    };

    /** Compra o renovación posterior a la principal, la que empieza antes. */
    const renovacionDe = (principalId: string): RenovacionPendiente | null => {
        const candidatas: RenovacionPendiente[] = [
            ...futuras
                .filter((p) => p.membresia.id !== principalId)
                .map((p) => ({ estado: 'POR_INICIAR' as const, fechaInicio: p.inicio })),
            ...(pendiente
                ? [{ estado: 'PENDIENTE_PAGO' as const, fechaInicio: aDia(pendiente.fechaInicioSolicitada) }]
                : []),
        ];
        return candidatas.sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio))[0] ?? null;
    };

    if (vigente) {
        const diasRestantes = diasEntre(fecha, vigente.vencimiento);
        // El Daypass dura un solo día: ese día está Vigente, no "Próxima a vencer" (H11).
        const esDaypass = vigente.membresia.tipoPlan === TipoPlan.DAYPASS;
        return detalle(
            !esDaypass && diasRestantes <= DIAS_PROXIMA_A_VENCER ? 'PROXIMA_A_VENCER' : 'VIGENTE',
            vigente.membresia,
            vigente,
            diasRestantes,
            renovacionDe(vigente.membresia.id),
        );
    }

    const porIniciar = futuras[0];
    if (porIniciar) {
        return detalle('POR_INICIAR', porIniciar.membresia, porIniciar, null, renovacionDe(porIniciar.membresia.id));
    }

    if (pendiente) {
        return detalle(
            'PENDIENTE_PAGO',
            pendiente,
            { inicio: aDia(pendiente.fechaInicioSolicitada), vencimiento: null },
            null,
            null,
        );
    }

    const ultima = [...pagadas].sort((a, b) => b.vencimiento.localeCompare(a.vencimiento))[0];
    if (ultima) return detalle('VENCIDA', ultima.membresia, ultima, null, null);

    return { ...SIN_MEMBRESIA };
}
