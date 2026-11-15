import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import type { EstadoMembresia } from '@PrismaClient';

/** Datos de una membresía que se usan para calcular el estado del miembro. */
export interface VigenciaMembresia {
    miembroId: string;
    estado: EstadoMembresia;
    fechaInicio: Date | null;
    fechaVencimiento: Date | null;
}

/** Único punto que habla con las tablas `membresia` y `membresia_tipo_clase`. */
@Injectable()
export class MembresiaRepository {
    constructor(private readonly prisma: PrismaService) { }

    /** Membresías de varios miembros, con lo necesario para calcular su estado. */
    findVigenciasDe(miembroIds: string[]): Promise<VigenciaMembresia[]> {
        if (miembroIds.length === 0) return Promise.resolve([]);
        return this.prisma.membresia.findMany({
            where: { miembroId: { in: miembroIds } },
            select: { miembroId: true, estado: true, fechaInicio: true, fechaVencimiento: true },
        });
    }
}
