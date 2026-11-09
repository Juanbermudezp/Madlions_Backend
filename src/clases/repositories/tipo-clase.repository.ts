import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { TipoClaseDuplicadoError } from '@Clases/errors';
import { Prisma, type TipoClase } from '@PrismaClient';

/** Código de Prisma para violación de restricción única. */
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

export interface DatosTipoClase {
    nombre: string;
    descripcion: string;
}

/** Único punto que habla con la tabla `tipo_clase`. */
@Injectable()
export class TipoClaseRepository {
    constructor(private readonly prisma: PrismaService) { }

    findActivos(): Promise<TipoClase[]> {
        return this.prisma.tipoClase.findMany({
            where: { activo: true },
            orderBy: { nombre: 'asc' },
        });
    }

    findById(id: string): Promise<TipoClase | null> {
        return this.prisma.tipoClase.findUnique({ where: { id } });
    }

    /**
     * Busca un tipo con el mismo nombre sin distinguir mayúsculas, para que
     * "yoga" y "Yoga" no convivan. `excluirId` deja fuera al tipo que se edita.
     */
    findPorNombre(nombre: string, excluirId?: string): Promise<TipoClase | null> {
        return this.prisma.tipoClase.findFirst({
            where: {
                nombre: { equals: nombre, mode: 'insensitive' },
                ...(excluirId ? { id: { not: excluirId } } : {}),
            },
        });
    }

    /** @throws {TipoClaseDuplicadoError} si el nombre ya existe. */
    async create(data: DatosTipoClase): Promise<TipoClase> {
        try {
            return await this.prisma.tipoClase.create({ data });
        } catch (error) {
            throw this.traducirError(error, data.nombre);
        }
    }

    /** @throws {TipoClaseDuplicadoError} si el nombre nuevo ya existe. */
    async update(id: string, data: Partial<DatosTipoClase>): Promise<TipoClase> {
        try {
            return await this.prisma.tipoClase.update({ where: { id }, data });
        } catch (error) {
            throw this.traducirError(error, data.nombre ?? '');
        }
    }

    private traducirError(error: unknown, nombre: string): unknown {
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === UNIQUE_CONSTRAINT_VIOLATION
        ) {
            return new TipoClaseDuplicadoError(nombre);
        }
        return error;
    }
}
