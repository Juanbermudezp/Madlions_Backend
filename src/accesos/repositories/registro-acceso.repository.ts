import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { MiembroDentroError } from '@Accesos/errors';
import { EstadoAcceso, Prisma, type RegistroAcceso } from '@PrismaClient';

/** Código de Prisma para violación de restricción única. */
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

export interface DatosIngreso {
    miembroId: string;
    ingresoEn: Date;
    registradoPorId: string;
    estadoMembresia: string;
    motivoExcepcion: string | null;
}

export interface MiembroConNombre {
    id: string;
    codigoMiembro: string;
    usuario: { nombre: string; apellido: string };
}

export type RegistroConMiembro = RegistroAcceso & {
    miembro: { codigoMiembro: string; usuario: { nombre: string; apellido: string } };
};

const INCLUIR_MIEMBRO = {
    miembro: {
        select: { codigoMiembro: true, usuario: { select: { nombre: true, apellido: true } } },
    },
} as const;

/** Único punto que habla con la tabla `registro_acceso` (H10). */
@Injectable()
export class RegistroAccesoRepository {
    constructor(private readonly prisma: PrismaService) { }

    findMiembro(miembroId: string): Promise<MiembroConNombre | null> {
        return this.prisma.miembro.findUnique({
            where: { id: miembroId },
            select: { id: true, codigoMiembro: true, usuario: { select: { nombre: true, apellido: true } } },
        });
    }

    /** Ingreso DENTRO del miembro, o null si no tiene uno abierto. */
    findAbiertoDeMiembro(miembroId: string): Promise<RegistroAcceso | null> {
        return this.prisma.registroAcceso.findFirst({
            where: { miembroId, estado: EstadoAcceso.DENTRO },
        });
    }

    findById(id: string): Promise<RegistroAcceso | null> {
        return this.prisma.registroAcceso.findUnique({ where: { id } });
    }

    /**
     * Crea el ingreso DENTRO. Si otro recepcionista registró el mismo miembro
     * al mismo tiempo, el índice único parcial lo rechaza.
     *
     * @throws {MiembroDentroError} si el miembro ya tiene un ingreso abierto.
     */
    async crearIngreso(datos: DatosIngreso): Promise<RegistroAcceso> {
        try {
            return await this.prisma.registroAcceso.create({
                data: { ...datos, estado: EstadoAcceso.DENTRO },
            });
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === UNIQUE_CONSTRAINT_VIOLATION
            ) {
                throw new MiembroDentroError();
            }
            throw error;
        }
    }

    /**
     * Registra la salida solo si el registro sigue DENTRO (operación
     * condicionada: dos salidas a la vez no pisan la primera).
     *
     * @returns el registro actualizado, o null si ya no estaba DENTRO.
     */
    async registrarSalida(
        id: string,
        salidaRegistradaPorId: string,
        salidaEn: Date,
    ): Promise<RegistroAcceso | null> {
        const { count } = await this.prisma.registroAcceso.updateMany({
            where: { id, estado: EstadoAcceso.DENTRO },
            data: { estado: EstadoAcceso.SALIO, salidaEn, salidaRegistradaPorId },
        });
        return count > 0 ? this.prisma.registroAcceso.findUnique({ where: { id } }) : null;
    }

    /** Ingresos con `ingreso_en` en [desde, hasta), el más reciente primero. */
    findEntre(desde: Date, hasta: Date): Promise<RegistroConMiembro[]> {
        return this.prisma.registroAcceso.findMany({
            where: { ingresoEn: { gte: desde, lt: hasta } },
            include: INCLUIR_MIEMBRO,
            orderBy: { ingresoEn: 'desc' },
        });
    }

    async cerrarAbiertosDelDia(desde: Date, salidaEn: Date): Promise<number> {
        const { count } = await this.prisma.registroAcceso.updateMany({
            where: {
                estado: EstadoAcceso.DENTRO,
                ingresoEn: { gte: desde, lte: salidaEn },
            },
            data: { estado: EstadoAcceso.CERRADO_AUTO, salidaEn },
        });
        return count;
    }
}