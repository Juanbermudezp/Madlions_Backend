import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';

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
