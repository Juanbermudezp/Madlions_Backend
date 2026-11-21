import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { ConceptoCobro, EstadoCobro, Prisma, type TipoPlan } from '@PrismaClient';

/** Una fila por día local/concepto/tipo histórico; SUM(numeric) conserva Decimal. */
export interface FilaIngreso {
    concepto: ConceptoCobro;
    tipoPlan: TipoPlan | null;
    fecha: string;
    total: Prisma.Decimal;
}

const SELECT_PAGO_INGRESO = {
    id: true, pagadoEn: true, monto: true,
    miembro: { select: { codigoMiembro: true, usuario: { select: { nombre: true, apellido: true } } } },
    comprobante: { select: { intento: { select: { cobroId: true, resultado: true, referencia: true } } } },
} as const satisfies Prisma.CobroSelect;

export type PagoIngreso = Prisma.CobroGetPayload<{ select: typeof SELECT_PAGO_INGRESO }>;

/** Fila agregada por tipo de clase y entrenador (H26). */
export interface FilaOcupacion {
    tipoClaseId: string;
    tipoClase: string;
    entrenadorId: string;
    entrenador: string;
    vecesImpartida: number;
    reservasConfirmadas: number;
    cupoTotal: number;
}

/** Consultas de solo lectura del Módulo 10. Leen las tablas de los demás módulos. */
@Injectable()
export class ReportesRepository {
    constructor(private readonly prisma: PrismaService) { }

    /** BE-27.1: una consulta/snapshot para ambos períodos. No se unen intentos
     * ni comprobantes (un cobro cuenta una vez). Membresia.id es único y su
     * tipo_plan es la copia histórica; referencia_id es una referencia polimórfica.
     * pagado_en es TIMESTAMP almacenado en UTC; El Salvador tiene desfase fijo -6.
     */
    ingresosPorDia(desde: Date, hasta: Date): Promise<FilaIngreso[]> {
        return this.prisma.$queryRaw<FilaIngreso[]>`
            SELECT c.concepto,
                   m.tipo_plan AS "tipoPlan",
                   to_char(c.pagado_en - INTERVAL '6 hours', 'YYYY-MM-DD') AS fecha,
                   SUM(c.monto) AS total
            FROM cobro c
            LEFT JOIN membresia m
              ON c.referencia_tipo = 'MEMBRESIA'
             AND c.concepto IN ('MEMBRESIA', 'RENOVACION')
             AND m.id = c.referencia_id
             AND m.miembro_id = c.miembro_id
            WHERE c.estado = 'PAGADO'
              AND c.pagado_en >= ${desde}
              AND c.pagado_en < ${hasta}
            GROUP BY c.concepto, m.tipo_plan,
                     to_char(c.pagado_en - INTERVAL '6 hours', 'YYYY-MM-DD')`;
    }

    /** BE-27.2: conteo y página comparten snapshot RepeatableRead. Selects
     * mínimos, sin N+1 en servicio ni relación 1:N de intentos. Las páginas
     * fuera del total omiten findMany, conservan el conteo y evitan OFFSET enorme.
     */
    detalleIngresos(concepto: ConceptoCobro, desde: Date, hasta: Date, pagina: number) {
        const where: Prisma.CobroWhereInput = { estado: EstadoCobro.PAGADO, concepto, pagadoEn: { gte: desde, lt: hasta } };
        return this.prisma.$transaction(async (tx) => {
            const total = await tx.cobro.count({ where });
            const saltar = (pagina - 1) * 20;
            const pagos: PagoIngreso[] = saltar >= total ? [] : await tx.cobro.findMany({
                where, skip: saltar, take: 20,
                orderBy: [{ pagadoEn: 'desc' }, { id: 'asc' }], select: SELECT_PAGO_INGRESO,
            });
            return { pagos, total };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    }

    /**
     * BE-26.1 · Clases impartidas en [desde, hasta) agrupadas por tipo y
     * entrenador, en una sola consulta agregada.
     *
     * - Impartida = estado PROGRAMADA y hora de fin anterior a `ahora` (las
     *   CANCELADA_GIMNASIO no cuentan).
     * - Solo cuentan las reservas CONFIRMADA (las canceladas por el miembro o
     *   por el gimnasio no).
     * - `desde` y `hasta` son instantes: el servicio ya convirtió los días de
     *   El Salvador a UTC, así que una clase cae en el día local en que empieza.
     *
     * H29 reutiliza esta consulta para la ocupación promedio por entrenador.
     */
    async ocupacionPorTipoYEntrenador(desde: Date, hasta: Date, ahora: Date): Promise<FilaOcupacion[]> {
        const filas = await this.prisma.$queryRaw<
            {
                tipo_clase_id: string;
                tipo_clase: string;
                entrenador_id: string;
                entrenador: string;
                veces: bigint;
                reservas: bigint;
                cupo: bigint;
            }[]
        >`
            SELECT c.tipo_clase_id,
                   t.nombre                          AS tipo_clase,
                   c.entrenador_id,
                   u.nombre || ' ' || u.apellido     AS entrenador,
                   COUNT(*)                          AS veces,
                   COALESCE(SUM(r.confirmadas), 0)   AS reservas,
                   SUM(c.cupo_maximo)                AS cupo
            FROM clase c
            JOIN tipo_clase t ON t.id = c.tipo_clase_id
            JOIN usuario u ON u.id = c.entrenador_id
            LEFT JOIN (
                SELECT clase_id, COUNT(*) AS confirmadas
                FROM reserva
                WHERE estado = 'CONFIRMADA'
                GROUP BY clase_id
            ) r ON r.clase_id = c.id
            WHERE c.estado = 'PROGRAMADA'
              AND c.fin <= ${ahora}
              AND c.inicio >= ${desde}
              AND c.inicio < ${hasta}
            GROUP BY c.tipo_clase_id, t.nombre, c.entrenador_id, u.nombre, u.apellido`;

        return filas.map((f) => ({
            tipoClaseId: f.tipo_clase_id,
            tipoClase: f.tipo_clase,
            entrenadorId: f.entrenador_id,
            entrenador: f.entrenador,
            vecesImpartida: Number(f.veces),
            reservasConfirmadas: Number(f.reservas),
            cupoTotal: Number(f.cupo),
        }));
    }
}
