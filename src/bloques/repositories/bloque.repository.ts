import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { HorarioOcupadoError } from '@Bloques/errors';
import {
    EstadoBloque,
    EstadoClase,
    type BloqueDisponibilidad,
} from '@PrismaClient';

export interface CrearBloqueData {
    entrenadorId: string;
    inicio: Date;
    fin: Date;
    duracionMin: number;
}

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