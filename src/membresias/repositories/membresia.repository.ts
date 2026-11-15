import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { MembresiaPendienteError } from '@Membresias/errors';
import {
    EstadoMembresia,
    Prisma,
    type Cobro,
    type Membresia,
    type TipoOperacionMembresia,
    type TipoPlan,
} from '@PrismaClient';

/** Código de Prisma para violación de restricción única. */
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';
const INDICE_PENDIENTE = 'membresia_miembro_pendiente_pago_key';

/** Miembro con los datos que muestra el resumen. */
export interface MiembroDeRegistro {
    id: string;
    codigoMiembro: string;
    usuario: { nombre: string; apellido: string };
}

/** Datos de una membresía nueva, con la copia de las condiciones del plan. */
export interface DatosMembresiaNueva {
    miembroId: string;
    planId: string;
    nombrePlan: string;
    tipoPlan: TipoPlan;
    precio: Prisma.Decimal;
    cantidadClases: number | null;
    tipoOperacion: TipoOperacionMembresia;
    membresiaAnteriorId: string | null;
    fechaInicioSolicitada: Date;
    registradaPorId: string;
}

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

    /**
     * Miembro con su nombre y código. Se lee aquí (y no en MiembroRepository)
     * porque MiembrosModule ya depende de MembresiasModule.
     */
    findMiembro(id: string): Promise<MiembroDeRegistro | null> {
        return this.prisma.miembro.findUnique({
            where: { id },
            select: { id: true, codigoMiembro: true, usuario: { select: { nombre: true, apellido: true } } },
        });
    }

    async tienePendiente(miembroId: string): Promise<boolean> {
        const total = await this.prisma.membresia.count({
            where: { miembroId, estado: EstadoMembresia.PENDIENTE_PAGO },
        });
        return total > 0;
    }

    /** Membresías PAGADAS del miembro con ese plan (candidatas a renovarse). */
    async findPagadasDelPlan(miembroId: string, planId: string): Promise<{ id: string; fechaVencimiento: Date }[]> {
        const filas = await this.prisma.membresia.findMany({
            where: { miembroId, planId, estado: EstadoMembresia.PAGADA },
            select: { id: true, fechaVencimiento: true },
        });
        return filas.flatMap((f) => (f.fechaVencimiento ? [{ id: f.id, fechaVencimiento: f.fechaVencimiento }] : []));
    }

    /**
     * Crea la membresía PENDIENTE_PAGO con sus tipos de clase y, en la misma
     * transacción, el cobro que devuelve `crearCobro`. Si el cobro falla, no
     * queda la membresía.
     *
     * @throws {MembresiaPendienteError} si el miembro ya tiene una pendiente.
     */
    async registrarConCobro(
        datos: DatosMembresiaNueva,
        tiposClaseIds: string[],
        crearCobro: (tx: Prisma.TransactionClient, membresiaId: string) => Promise<Cobro>,
    ): Promise<{ membresia: Membresia; cobro: Cobro }> {
        try {
            return await this.prisma.$transaction(async (tx) => {
                const membresia = await tx.membresia.create({
                    data: {
                        ...datos,
                        estado: EstadoMembresia.PENDIENTE_PAGO,
                        tiposClase: { create: tiposClaseIds.map((tipoClaseId) => ({ tipoClaseId })) },
                    },
                });
                const cobro = await crearCobro(tx, membresia.id);
                return { membresia, cobro };
            });
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === UNIQUE_CONSTRAINT_VIOLATION &&
                JSON.stringify(error.meta ?? {}).includes(INDICE_PENDIENTE)
            ) {
                throw new MembresiaPendienteError(datos.miembroId);
            }
            throw error;
        }
    }

    /** Membresías de varios miembros, con lo necesario para calcular su estado. */
    findVigenciasDe(miembroIds: string[]): Promise<VigenciaMembresia[]> {
        if (miembroIds.length === 0) return Promise.resolve([]);
        return this.prisma.membresia.findMany({
            where: { miembroId: { in: miembroIds } },
            select: { miembroId: true, estado: true, fechaInicio: true, fechaVencimiento: true },
        });
    }
}
