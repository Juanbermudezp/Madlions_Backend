import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { PlanDuplicadoError } from '@Planes/errors';
import { Prisma, type Plan, type TipoPlan } from '@PrismaClient';

/** Código de Prisma para violación de restricción única. */
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

const INCLUIR_TIPOS_CLASE = {
    tiposClase: {
        select: { tipoClase: { select: { id: true, nombre: true } } },
    },
} as const;

/** Plan con el id y el nombre de los tipos de clase que incluye. */
export type PlanConTiposClase = Plan & {
    tiposClase: { tipoClase: { id: string; nombre: string } }[];
};

/** Datos que se guardan al crear un plan. */
export interface DatosPlan {
    nombre: string;
    tipo: TipoPlan;
    precio: number;
    cantidadClases: number | null;
    duracionDias: number;
    beneficios: string;
}

/** Campos que se pueden cambiar al editar un plan (el tipo no). */
export type CambiosPlan = Partial<Pick<DatosPlan, 'nombre' | 'precio' | 'cantidadClases' | 'beneficios'>>;

/**
 * Único punto que habla con las tablas `plan` y `plan_tipo_clase`.
 *
 * No toca membresías ni cobros: las membresías vendidas (H2) guardan una
 * copia de las condiciones del plan, así que editarlo no las altera.
 */
@Injectable()
export class PlanRepository {
    constructor(private readonly prisma: PrismaService) { }

    /** Todos los planes, o solo los activos, ordenados por nombre. */
    findTodos(soloActivos: boolean): Promise<PlanConTiposClase[]> {
        return this.prisma.plan.findMany({
            where: soloActivos ? { activo: true } : {},
            orderBy: { nombre: 'asc' },
            include: INCLUIR_TIPOS_CLASE,
        });
    }

    findById(id: string): Promise<PlanConTiposClase | null> {
        return this.prisma.plan.findUnique({ where: { id }, include: INCLUIR_TIPOS_CLASE });
    }

    /**
     * Busca un plan con el mismo nombre sin distinguir mayúsculas, para que
     * "Mensual" y "mensual" no convivan. `excluirId` deja fuera al plan que se
     * edita.
     */
    findPorNombre(nombre: string, excluirId?: string): Promise<Plan | null> {
        return this.prisma.plan.findFirst({
            where: {
                nombre: { equals: nombre, mode: 'insensitive' },
                ...(excluirId ? { id: { not: excluirId } } : {}),
            },
        });
    }

    /**
     * Crea el plan y sus tipos de clase en una sola escritura anidada, que
     * Prisma ejecuta dentro de una transacción.
     *
     * @throws {PlanDuplicadoError} si el nombre ya existe.
     */
    async create(data: DatosPlan, tiposClaseIds: string[]): Promise<PlanConTiposClase> {
        try {
            return await this.prisma.plan.create({
                data: {
                    ...data,
                    tiposClase: {
                        create: tiposClaseIds.map((tipoClaseId) => ({ tipoClaseId })),
                    },
                },
                include: INCLUIR_TIPOS_CLASE,
            });
        } catch (error) {
            throw this.traducirError(error, data.nombre);
        }
    }

    /**
     * Guarda los cambios del plan. Si llegan `tiposClaseIds`, reemplaza por
     * completo sus tipos de clase; todo en una sola transacción.
     *
     * @throws {PlanDuplicadoError} si el nombre nuevo ya existe.
     */
    async update(
        id: string,
        cambios: CambiosPlan,
        tiposClaseIds?: string[],
    ): Promise<PlanConTiposClase> {
        try {
            return await this.prisma.plan.update({
                where: { id },
                data: {
                    ...cambios,
                    ...(tiposClaseIds
                        ? {
                            tiposClase: {
                                deleteMany: {},
                                create: tiposClaseIds.map((tipoClaseId) => ({ tipoClaseId })),
                            },
                        }
                        : {}),
                },
                include: INCLUIR_TIPOS_CLASE,
            });
        } catch (error) {
            throw this.traducirError(error, cambios.nombre ?? '');
        }
    }

    /**
     * Desactiva el plan solo si sigue activo. Devuelve false si ya estaba
     * inactivo (o no existe), así dos peticiones simultáneas no lo desactivan
     * dos veces.
     */
    async desactivar(id: string): Promise<boolean> {
        const { count } = await this.prisma.plan.updateMany({
            where: { id, activo: true },
            data: { activo: false },
        });
        return count > 0;
    }

    private traducirError(error: unknown, nombre: string): unknown {
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === UNIQUE_CONSTRAINT_VIOLATION
        ) {
            return new PlanDuplicadoError(nombre);
        }
        return error;
    }
}
