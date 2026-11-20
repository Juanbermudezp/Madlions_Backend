import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { Rol } from '@PrismaClient';

/** Un entrenador o un tipo de clase con lo que se calificó de él en el rango. */
export interface AgregadoCalificacion {
    id: string;
    nombre: string;
    /** Promedio crudo, sin redondear; null si nadie calificó ese aspecto. */
    promedio: number | null;
    /** Reseñas que calificaron ese aspecto. */
    total: number;
}

export interface AgregadoSimple {
    promedio: number | null;
    total: number;
}

/**
 * Consultas de solo lectura de las calificaciones (H21).
 *
 * Los promedios se piden a la base con `_avg`, que ignora los nulos, y el
 * total con `_count` del mismo campo, que cuenta solo los no nulos: así una
 * reseña que omitió un aspecto no pesa en ese aspecto.
 */
@Injectable()
export class CalificacionesRepository {
    constructor(private readonly prisma: PrismaService) { }

    /**
     * Promedio de `calEntrenador` por entrenador. Salen **todos** los
     * entrenadores, también los que no tienen reseñas en el rango: para la
     * administración, un entrenador sin reseñas es información.
     */
    async porEntrenador(desde: Date, hasta: Date): Promise<AgregadoCalificacion[]> {
        const [entrenadores, agregados] = await Promise.all([
            this.prisma.user.findMany({
                where: { rol: Rol.ENTRENADOR },
                select: { id: true, nombre: true, apellido: true },
                orderBy: [{ nombre: 'asc' }, { apellido: 'asc' }],
            }),
            this.prisma.resena.groupBy({
                by: ['entrenadorId'],
                where: { creadaEn: { gte: desde, lt: hasta } },
                _avg: { calEntrenador: true },
                _count: { calEntrenador: true },
            }),
        ]);

        const porId = new Map(agregados.map((fila) => [fila.entrenadorId, fila]));

        return entrenadores.map((entrenador) => {
            const fila = porId.get(entrenador.id);
            return {
                id: entrenador.id,
                nombre: `${entrenador.nombre} ${entrenador.apellido}`,
                promedio: fila?._avg.calEntrenador ?? null,
                total: fila?._count.calEntrenador ?? 0,
            };
        });
    }

    /**
     * Promedio de `calActividad` por tipo de clase. Las sesiones personales no
     * entran: no son de un tipo de clase (su reseña va sin `tipoClaseId`).
     */
    async porTipoClase(desde: Date, hasta: Date): Promise<AgregadoCalificacion[]> {
        const [tipos, agregados] = await Promise.all([
            this.prisma.tipoClase.findMany({
                select: { id: true, nombre: true },
                orderBy: { nombre: 'asc' },
            }),
            this.prisma.resena.groupBy({
                by: ['tipoClaseId'],
                where: { creadaEn: { gte: desde, lt: hasta }, tipoClaseId: { not: null } },
                _avg: { calActividad: true },
                _count: { calActividad: true },
            }),
        ]);

        const porId = new Map(agregados.map((fila) => [fila.tipoClaseId, fila]));

        return tipos.map((tipo) => {
            const fila = porId.get(tipo.id);
            return {
                id: tipo.id,
                nombre: tipo.nombre,
                promedio: fila?._avg.calActividad ?? null,
                total: fila?._count.calActividad ?? 0,
            };
        });
    }

    /** Promedio de `calInstalaciones` de todas las reseñas del rango. */
    async instalaciones(desde: Date, hasta: Date): Promise<AgregadoSimple> {
        const agregado = await this.prisma.resena.aggregate({
            where: { creadaEn: { gte: desde, lt: hasta } },
            _avg: { calInstalaciones: true },
            _count: { calInstalaciones: true },
        });

        return {
            promedio: agregado._avg.calInstalaciones ?? null,
            total: agregado._count.calInstalaciones,
        };
    }
}
