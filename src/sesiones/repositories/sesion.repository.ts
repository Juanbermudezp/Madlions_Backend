import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { AgendaRechazadaError, MENSAJES_AGENDA } from '@Sesiones/errors';
import {
    EstadoSesion,
    Prisma,
    type EstadoCobro,
    type SesionPersonal,
} from '@PrismaClient';

/** Código de Prisma para violación de restricción única. */
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

export interface DatosSesion {
    id: string;
    bloqueId: string;
    miembroId: string;
    entrenadorId: string;
    inicio: Date;
    fin: Date;
    /** Precio de la clase puntual con 2 decimales ("10.00"). */
    precio: string;
    cobroId: string;
}

/** Sesión con el nombre del entrenador y el estado de su cobro. */
export type SesionConDetalle = SesionPersonal & {
    entrenador: { nombre: string; apellido: string };
    cobro: { id: string; estado: EstadoCobro } | null;
};

/** Único punto que habla con la tabla `sesion_personal` (H9). */
@Injectable()
export class SesionRepository {
    constructor(private readonly prisma: PrismaService) { }

    /** Ejecuta `fn` en una transacción: si lanza un error, no queda nada de lo que escribió. */
    transaccion<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
        return this.prisma.$transaction(fn);
    }

    /** Id de la ficha de miembro del usuario, o null si no tiene ficha. */
    async findMiembroIdDeUsuario(usuarioId: string): Promise<string | null> {
        const miembro = await this.prisma.miembro.findUnique({
            where: { usuarioId },
            select: { id: true },
        });
        return miembro?.id ?? null;
    }

    /**
     * Serializa los agendamientos de un mismo miembro: si confirma dos bloques
     * a la vez, el segundo espera y ve la primera sesión al contar el límite
     * y los traslapes. Se libera solo al terminar la transacción. Se usa
     * $executeRaw porque $queryRaw no puede leer el `void` que devuelve.
     */
    async bloquearMiembro(miembroId: string, tx: Prisma.TransactionClient): Promise<void> {
        const clave = `sesion:${miembroId}`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${clave}::text))`;
    }

    /** Sesiones AGENDADAS del miembro que todavía no empiezan. */
    contarPendientes(
        miembroId: string,
        ahora: Date,
        tx: Prisma.TransactionClient,
    ): Promise<number> {
        return tx.sesionPersonal.count({
            where: { miembroId, estado: EstadoSesion.AGENDADA, inicio: { gt: ahora } },
        });
    }

    /** true si el miembro tiene otra sesión AGENDADA que se cruza con [inicio, fin). */
    async hayTraslape(
        miembroId: string,
        inicio: Date,
        fin: Date,
        tx: Prisma.TransactionClient,
    ): Promise<boolean> {
        const cantidad = await tx.sesionPersonal.count({
            where: {
                miembroId,
                estado: EstadoSesion.AGENDADA,
                inicio: { lt: fin },
                fin: { gt: inicio },
            },
        });
        return cantidad > 0;
    }

    /**
     * Inserta la sesión. El índice único de bloque_id es la última defensa
     * contra la doble reserva: si salta, se informa como horario no disponible.
     */
    async crear(datos: DatosSesion, tx: Prisma.TransactionClient): Promise<SesionPersonal> {
        try {
            return await tx.sesionPersonal.create({ data: datos });
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === UNIQUE_CONSTRAINT_VIOLATION
            ) {
                throw new AgendaRechazadaError(MENSAJES_AGENDA.NO_DISPONIBLE);
            }
            throw error;
        }
    }

    /**
     * Sesiones del miembro que pertenece al usuario. El filtro va por la
     * relación sesión → miembro → usuario, así nunca se devuelven sesiones ajenas.
     */
    findDeUsuario(usuarioId: string): Promise<SesionConDetalle[]> {
        return this.prisma.sesionPersonal.findMany({
            where: { miembro: { usuarioId } },
            include: {
                entrenador: { select: { nombre: true, apellido: true } },
                cobro: { select: { id: true, estado: true } },
            },
            orderBy: { inicio: 'asc' },
        });
    }
}