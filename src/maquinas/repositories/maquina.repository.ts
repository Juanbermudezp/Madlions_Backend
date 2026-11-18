import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import {
    EstadoMaquina,
    type HistorialMaquina,
    type Maquina,
    type Prisma,
    type TipoMaquina,
    type ZonaMaquina,
} from '@PrismaClient';

// Filtros de GET /maquinas. Los que llegan se combinan con AND
export interface FiltrosMaquina {
    estado?: EstadoMaquina;
    tipo?: TipoMaquina;
    zona?: ZonaMaquina;
}

// Filtros del resumen: el estado no cuenta, porque el resumen lo desglosa.
export type FiltrosInventario = Omit<FiltrosMaquina, 'estado'>;

const INCLUIR_ULTIMO_CAMBIO = {
    ultimoCambioPor: { select: { id: true, nombre: true, apellido: true } },
} as const;

// Máquina con el nombre del usuario que hizo el último cambio de estado.
export type MaquinaConUltimoCambio = Maquina & {
    ultimoCambioPor: { id: string; nombre: string; apellido: string } | null;
};

// Cambio de estado del historial, con quién lo hizo (H18).
export type CambioConUsuario = HistorialMaquina & {
    cambiadoPor: { id: string; nombre: string; apellido: string };
};

// Lo que hace falta para registrar un cambio de estado (H18).
export interface DatosCambioEstado {
    maquinaId: string;
    estadoAnterior: EstadoMaquina;
    estadoNuevo: EstadoMaquina;
    motivo: string;
    fechaEstimadaRetorno: Date | null;
    usuarioId: string;
}

// Resumen vacío: los tres estados en 0, para que el conteo nunca omita uno.
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

    findById(id: string): Promise<MaquinaConUltimoCambio | null> {
        return this.prisma.maquina.findUnique({
            where: { id },
            include: INCLUIR_ULTIMO_CAMBIO,
        });
    }

    /**
     * Cambia el estado y deja el cambio en el historial en una sola
     * transacción (criterio técnico de BE-18.1).
     *
     * El UPDATE exige que la máquina siga en `estadoAnterior`: si otra
     * petición le ganó, no actualiza nada y devuelve null en vez de registrar
     * un cambio que no pasó.
     */
    cambiarEstado(datos: DatosCambioEstado): Promise<MaquinaConUltimoCambio | null> {
        return this.prisma.$transaction(async (tx) => {
            const { count } = await tx.maquina.updateMany({
                where: { id: datos.maquinaId, estado: datos.estadoAnterior },
                data: {
                    estado: datos.estadoNuevo,
                    fechaEstimadaRetorno: datos.fechaEstimadaRetorno,
                    ultimoMotivo: datos.motivo,
                    ultimoCambioPorId: datos.usuarioId,
                },
            });
            if (count === 0) return null;

            await tx.historialMaquina.create({
                data: {
                    maquinaId: datos.maquinaId,
                    estadoAnterior: datos.estadoAnterior,
                    estadoNuevo: datos.estadoNuevo,
                    motivo: datos.motivo,
                    fechaEstimadaRetorno: datos.fechaEstimadaRetorno,
                    cambiadoPorId: datos.usuarioId,
                },
            });

            return tx.maquina.findUniqueOrThrow({
                where: { id: datos.maquinaId },
                include: INCLUIR_ULTIMO_CAMBIO,
            });
        });
    }

    /** Historial de una máquina, del más reciente al más antiguo (criterio 3). */
    findHistorial(maquinaId: string): Promise<CambioConUsuario[]> {
        return this.prisma.historialMaquina.findMany({
            where: { maquinaId },
            orderBy: { cambiadoEn: 'desc' },
            include: { cambiadoPor: { select: { id: true, nombre: true, apellido: true } } },
        });
    }

    private armarWhere(filtros: FiltrosMaquina): Prisma.MaquinaWhereInput {
        return {
            ...(filtros.estado ? { estado: filtros.estado } : {}),
            ...(filtros.tipo ? { tipo: filtros.tipo } : {}),
            ...(filtros.zona ? { zona: filtros.zona } : {}),
        };
    }
}
