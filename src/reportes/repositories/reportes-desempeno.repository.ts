import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { AsistenciaSesion, Rol } from '@PrismaClient';

export interface EntrenadorDelReporte {
    id: string;
    nombre: string;
}

export interface ResenasDeEntrenador {
    entrenadorId: string;
    promedio: number | null;
    total: number;
}

/**
 * Consultas propias del reporte de desempeño (H29). La ocupación no se
 * consulta aquí: se reutiliza ReportesRepository.ocupacionPorTipoYEntrenador (H26).
 */
@Injectable()
export class ReportesDesempenoRepository {
    constructor(private readonly prisma: PrismaService) { }

    /** Usuarios con rol ENTRENADOR (todos, o solo `id`), por nombre. */
    entrenadores(id?: string): Promise<EntrenadorDelReporte[]> {
        return this.prisma.user
            .findMany({
                where: { rol: Rol.ENTRENADOR, ...(id ? { id } : {}) },
                select: { id: true, nombre: true, apellido: true },
                orderBy: [{ nombre: 'asc' }, { apellido: 'asc' }],
            })
            .then((filas) => filas.map((u) => ({ id: u.id, nombre: `${u.nombre} ${u.apellido}` })));
    }

    /**
     * Sesiones personales realizadas por entrenador: empiezan en el rango, su
     * hora de fin ya pasó y el entrenador registró "Asistió" (H19).
     */
    async sesionesRealizadas(desde: Date, hasta: Date, ahora: Date): Promise<Map<string, number>> {
        const grupos = await this.prisma.sesionPersonal.groupBy({
            by: ['entrenadorId'],
            where: {
                inicio: { gte: desde, lt: hasta },
                fin: { lte: ahora },
                asistencia: AsistenciaSesion.ASISTIO,
            },
            _count: { _all: true },
        });
        return new Map(grupos.map((g) => [g.entrenadorId, g._count._all]));
    }

    /**
     * Promedio de `calEntrenador` y cuántas reseñas lo calificaron, por
     * entrenador, con las reseñas creadas en el rango (mismo criterio que H21).
     */
    async resenas(desde: Date, hasta: Date): Promise<Map<string, ResenasDeEntrenador>> {
        const grupos = await this.prisma.resena.groupBy({
            by: ['entrenadorId'],
            where: { creadaEn: { gte: desde, lt: hasta } },
            _avg: { calEntrenador: true },
            _count: { calEntrenador: true },
        });
        return new Map(
            grupos.map((g) => [
                g.entrenadorId,
                { entrenadorId: g.entrenadorId, promedio: g._avg.calEntrenador ?? null, total: g._count.calEntrenador },
            ]),
        );
    }
}
