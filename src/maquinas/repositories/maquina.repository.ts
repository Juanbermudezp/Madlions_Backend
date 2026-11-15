import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import {
    EstadoMaquina,
    type Maquina,
    type Prisma,
    type TipoMaquina,
    type ZonaMaquina,
} from '@PrismaClient';

/** Filtros de GET /maquinas. Los que llegan se combinan con AND. */
export interface FiltrosMaquina {
    estado?: EstadoMaquina;
    tipo?: TipoMaquina;
    zona?: ZonaMaquina;
}

/** Filtros del resumen: el estado no cuenta, porque el resumen lo desglosa. */
export type FiltrosInventario = Omit<FiltrosMaquina, 'estado'>;

const INCLUIR_ULTIMO_CAMBIO = {
    ultimoCambioPor: { select: { id: true, nombre: true, apellido: true } },
} as const;

/** Máquina con el nombre del usuario que hizo el último cambio de estado. */
export type MaquinaConUltimoCambio = Maquina & {
    ultimoCambioPor: { id: string; nombre: string; apellido: string } | null;
};

/** Resumen vacío: los tres estados en 0, para que el conteo nunca omita uno. */
function resumenEnCero(): Record<EstadoMaquina, number> {
    return {
        [EstadoMaquina.OPERATIVA]: 0,
        [EstadoMaquina.EN_MANTENIMIENTO]: 0,
        [EstadoMaquina.FUERA_DE_SERVICIO]: 0,
    };
}

/**
 * Único punto que habla con la tabla `maquina`.
 *
 * El inventario es chico (docenas de filas) y el endpoint devuelve el listado
 * completo, así que no se pagina: el resumen por estado tiene que cuadrar con
 * lo que se ve en pantalla.
 */
@Injectable()
export class MaquinaRepository {
    constructor(private readonly prisma: PrismaService) { }

    /** Máquinas que cumplen todos los filtros, ordenadas por código. */
    findTodas(filtros: FiltrosMaquina): Promise<MaquinaConUltimoCambio[]> {
        return this.prisma.maquina.findMany({
            where: this.armarWhere(filtros),
            orderBy: { codigo: 'asc' },
            include: INCLUIR_ULTIMO_CAMBIO,
        });
    }

    /**
     * Cuántas máquinas hay en cada estado dentro del tipo y la zona elegidos.
     * Los estados sin máquinas vienen en 0, no ausentes.
     */
    async contarPorEstado(
        filtros: FiltrosInventario,
    ): Promise<Record<EstadoMaquina, number>> {
        const grupos = await this.prisma.maquina.groupBy({
            by: ['estado'],
            where: this.armarWhere(filtros),
            _count: { _all: true },
        });

        return grupos.reduce((resumen, grupo) => {
            resumen[grupo.estado] = grupo._count._all;
            return resumen;
        }, resumenEnCero());
    }

    private armarWhere(filtros: FiltrosMaquina): Prisma.MaquinaWhereInput {
        return {
            ...(filtros.estado ? { estado: filtros.estado } : {}),
            ...(filtros.tipo ? { tipo: filtros.tipo } : {}),
            ...(filtros.zona ? { zona: filtros.zona } : {}),
        };
    }
}
