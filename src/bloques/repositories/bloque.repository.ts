import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { HorarioOcupadoError } from '@Bloques/errors';
import {
    EstadoBloque,
    EstadoClase,
    type BloqueDisponibilidad,
    type Prisma,
} from '@PrismaClient'; 
export interface CrearBloqueData {
    entrenadorId: string;
    inicio: Date;
    fin: Date;
    duracionMin: number;
}
/** Bloque con el nombre de su entrenador (H9). */
export type BloqueConEntrenador = BloqueDisponibilidad & {
    entrenador: { nombre: string; apellido: string };
};
@Injectable()
export class BloqueRepository {
    constructor(private readonly prisma: PrismaService) { }

    findById(id: string): Promise<BloqueDisponibilidad | null> {
        return this.prisma.bloqueDisponibilidad.findUnique({ where: { id } });
    }

    /** Bloques del entrenador que empiezan en el rango [desde, hasta). */
    findDelEntrenadorEntre(
        entrenadorId: string,
        desde: Date,
        hasta: Date,
    ): Promise<BloqueDisponibilidad[]> {
        return this.prisma.bloqueDisponibilidad.findMany({
            where: { entrenadorId, inicio: { gte: desde, lt: hasta } },
            orderBy: { inicio: 'asc' },
        });
    }

    /**
 * Bloques DISPONIBLES del entrenador que empiezan entre `desde` y `hasta`,
 * ambos incluidos (H9). Es la vista del miembro: nunca incluye OCUPADOS.
 */
    findDisponiblesDelEntrenadorEntre(
        entrenadorId: string,
        desde: Date,
        hasta: Date,
    ): Promise<BloqueDisponibilidad[]> {
        return this.prisma.bloqueDisponibilidad.findMany({
            where: {
                entrenadorId,
                estado: EstadoBloque.DISPONIBLE,
                inicio: { gte: desde, lte: hasta },
            },
            orderBy: { inicio: 'asc' },
        });
    }

        /** Bloque con el nombre de su entrenador, o null si no existe (H9). */
    findConEntrenador(id: string): Promise<BloqueConEntrenador | null> {
        return this.prisma.bloqueDisponibilidad.findUnique({
            where: { id },
            include: { entrenador: { select: { nombre: true, apellido: true } } },
        });
    }

    /**
     * Pasa el bloque a OCUPADO solo si sigue DISPONIBLE, dentro de la
     * transacción del agendamiento (H9).
     *
     * Es una operación condicionada: si dos miembros confirman el mismo bloque
     * a la vez, PostgreSQL bloquea la fila; el segundo espera, vuelve a evaluar
     * `estado = DISPONIBLE` cuando el primero termina y ya no actualiza nada.
     *
     * @returns true si lo ocupó; false si ya no estaba disponible.
     */
    
    async ocuparSiDisponible(id: string, tx: Prisma.TransactionClient): Promise<boolean> {
        const { count } = await tx.bloqueDisponibilidad.updateMany({
            where: { id, estado: EstadoBloque.DISPONIBLE },
            data: { estado: EstadoBloque.OCUPADO },
        });
        return count > 0;
    }

    crearSinTraslape(data: CrearBloqueData): Promise<BloqueDisponibilidad> {
        return this.prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${data.entrenadorId}::text))`;

            const traslape = { inicio: { lt: data.fin }, fin: { gt: data.inicio } };

            const bloques = await tx.bloqueDisponibilidad.count({
                where: { entrenadorId: data.entrenadorId, ...traslape },
            });
            const clases = await tx.clase.count({
                where: {
                    entrenadorId: data.entrenadorId,
                    estado: EstadoClase.PROGRAMADA,
                    ...traslape,
                },
            });

            if (bloques + clases > 0) {
                throw new HorarioOcupadoError();
            }

            return tx.bloqueDisponibilidad.create({ data });
        });
    }

    async eliminarSiDisponible(id: string): Promise<boolean> {
        const { count } = await this.prisma.bloqueDisponibilidad.deleteMany({
            where: { id, estado: EstadoBloque.DISPONIBLE },
        });
        return count > 0;
    }
}