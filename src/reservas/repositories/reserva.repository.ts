import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { EstadoClase, EstadoReserva, Prisma, type Clase, type Reserva, type TipoClase } from '@PrismaClient';

/** Reserva con los datos de su clase que muestra "Mis reservas". */
export type ReservaConClase = Reserva & {
    clase: Clase & {
        tipoClase: TipoClase;
        entrenador: { id: string; nombre: string; apellido: string };
    };
};

/** Cliente de Prisma dentro de una transacción interactiva. */
export type Tx = Prisma.TransactionClient;

/** Clase bloqueada con SELECT … FOR UPDATE para registrar una reserva (BE-5.2). */
export interface ClaseBloqueada {
    id: string;
    estado: string;
    inicio: Date;
    fin: Date;
    cupoMaximo: number;
    tipoClaseId: string;
    tipo: string;
    entrenador: string;
}

/** Único punto que habla con la tabla `reserva` (H5). */
@Injectable()
export class ReservaRepository {
    constructor(private readonly prisma: PrismaService) { }

    /** Ficha de miembro del usuario autenticado, o null si no tiene. */
    async findMiembroIdDeUsuario(usuarioId: string): Promise<string | null> {
        const miembro = await this.prisma.miembro.findUnique({
            where: { usuarioId },
            select: { id: true },
        });
        return miembro?.id ?? null;
    }

    /** Ids de las clases (de la lista) en las que el miembro tiene una reserva CONFIRMADA. */
    async findClasesReservadasPor(miembroId: string, claseIds: string[]): Promise<Set<string>> {
        if (claseIds.length === 0) return new Set();
        const reservas = await this.prisma.reserva.findMany({
            where: { miembroId, claseId: { in: claseIds }, estado: EstadoReserva.CONFIRMADA },
            select: { claseId: true },
        });
        return new Set(reservas.map((r) => r.claseId));
    }

    /**
     * Reservas del miembro, de cualquier estado.
     * - Próximas: clases que aún no terminan, de la más cercana a la más lejana.
     * - Pasadas: clases que ya terminaron, de la más reciente a la más antigua.
     */
    findDelMiembro(
        miembroId: string,
        pestana: 'proximas' | 'pasadas',
        ahora: Date,
    ): Promise<ReservaConClase[]> {
        const proximas = pestana === 'proximas';
        return this.prisma.reserva.findMany({
            where: {
                miembroId,
                clase: { fin: proximas ? { gt: ahora } : { lte: ahora } },
            },
            include: {
                clase: {
                    include: {
                        tipoClase: true,
                        entrenador: { select: { id: true, nombre: true, apellido: true } },
                    },
                },
            },
            orderBy: [{ clase: { inicio: proximas ? 'asc' : 'desc' } }, { creadaEn: 'desc' }],
        });
    }

    // ------------------------------------------------------------------
    // BE-5.2 · Registro de una reserva. Todo lo que sigue corre dentro de
    // una sola transacción que empieza bloqueando la fila de la clase.
    // ------------------------------------------------------------------

    /** Corre `fn` en una transacción interactiva. */
    transaccion<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
        return this.prisma.$transaction(fn);
    }

    /**
     * Bloquea la fila de la clase (SELECT … FOR UPDATE) hasta el final de la
     * transacción. Dos reservas de la misma clase quedan en fila: la segunda
     * espera y, al seguir, ya ve la reserva de la primera al contar el cupo.
     * Devuelve null si la clase no existe.
     */
    async bloquearClase(tx: Tx, claseId: string): Promise<ClaseBloqueada | null> {
        const filas = await tx.$queryRaw<ClaseBloqueada[]>`
            SELECT c.id,
                   c.estado::text                         AS estado,
                   c.inicio,
                   c.fin,
                   c.cupo_maximo                          AS "cupoMaximo",
                   c.tipo_clase_id                        AS "tipoClaseId",
                   t.nombre                               AS tipo,
                   u.nombre || ' ' || u.apellido          AS entrenador
            FROM clase c
            JOIN tipo_clase t ON t.id = c.tipo_clase_id
            JOIN usuario u ON u.id = c.entrenador_id
            WHERE c.id = ${claseId}::uuid
            FOR UPDATE OF c`;
        return filas[0] ?? null;
    }

    /**
     * Bloquea la membresía con la que se reserva, para que dos reservas
     * simultáneas del mismo miembro en clases distintas no gasten el mismo
     * crédito del set.
     */
    async bloquearMembresia(tx: Tx, membresiaId: string): Promise<void> {
        await tx.$queryRaw`SELECT id FROM membresia WHERE id = ${membresiaId}::uuid FOR UPDATE`;
    }

    contarConfirmadasDeClase(tx: Tx, claseId: string): Promise<number> {
        return tx.reserva.count({ where: { claseId, estado: EstadoReserva.CONFIRMADA } });
    }

    contarConfirmadasDeMembresia(tx: Tx, membresiaId: string): Promise<number> {
        return tx.reserva.count({ where: { membresiaId, estado: EstadoReserva.CONFIRMADA } });
    }

    async existeConfirmada(tx: Tx, claseId: string, miembroId: string): Promise<boolean> {
        const n = await tx.reserva.count({
            where: { claseId, miembroId, estado: EstadoReserva.CONFIRMADA },
        });
        return n > 0;
    }

    /**
     * ¿El miembro tiene otra reserva CONFIRMADA en una clase PROGRAMADA que se
     * cruza con [inicio, fin)? Los bordes que solo se tocan no son traslape.
     *
     * Pendiente de H9: cuando `sesion_personal` llegue a develop, revisar
     * también sus sesiones AGENDADAS en el mismo intervalo.
     */
    async tieneTraslape(tx: Tx, miembroId: string, claseId: string, inicio: Date, fin: Date): Promise<boolean> {
        const n = await tx.reserva.count({
            where: {
                miembroId,
                estado: EstadoReserva.CONFIRMADA,
                clase: {
                    id: { not: claseId },
                    estado: EstadoClase.PROGRAMADA,
                    inicio: { lt: fin },
                    fin: { gt: inicio },
                },
            },
        });
        return n > 0;
    }

    crear(tx: Tx, datos: { claseId: string; miembroId: string; membresiaId: string }): Promise<Reserva> {
        return tx.reserva.create({ data: datos });
    }

    // ------------------------------------------------------------------
    // BE-6.1 · Cancelación de una reserva por el miembro (H6).
    // ------------------------------------------------------------------

    /** Reserva con su dueño y los datos de la clase que necesita la cancelación, o null si no existe. */
    async findParaCancelar(reservaId: string): Promise<ReservaParaCancelar | null> {
        const reserva = await this.prisma.reserva.findUnique({
            where: { id: reservaId },
            select: {
                id: true,
                estado: true,
                claseId: true,
                miembro: { select: { usuarioId: true } },
                clase: { select: { inicio: true, cupoMaximo: true } },
            },
        });
        if (!reserva) return null;
        return {
            id: reserva.id,
            estado: reserva.estado,
            claseId: reserva.claseId,
            usuarioId: reserva.miembro.usuarioId,
            inicioClase: reserva.clase.inicio,
            cupoMaximo: reserva.clase.cupoMaximo,
        };
    }

    /**
     * Pasa la reserva a CANCELADA_MIEMBRO solo si sigue CONFIRMADA y su clase
     * empieza en `limite` o después (ahora + 2 horas). La condición va en el
     * mismo UPDATE, así que dos cancelaciones simultáneas no se aplican dos
     * veces. El lugar y el crédito se liberan solos: ambos se calculan contando
     * las reservas CONFIRMADA.
     *
     * @returns true si se canceló; false si otra petición la cambió primero o ya no está en plazo.
     */
    async cancelarConfirmada(tx: Tx, reservaId: string, limite: Date, ahora: Date): Promise<boolean> {
        const { count } = await tx.reserva.updateMany({
            where: {
                id: reservaId,
                estado: EstadoReserva.CONFIRMADA,
                clase: { inicio: { gte: limite } },
            },
            data: { estado: EstadoReserva.CANCELADA_MIEMBRO, canceladaEn: ahora },
        });
        return count === 1;
    }
}

/** Lo que BE-6.1 necesita de una reserva para decidir si se puede cancelar. */
export interface ReservaParaCancelar {
    id: string;
    estado: EstadoReserva;
    claseId: string;
    /** Usuario dueño de la reserva (el de la ficha de miembro), para comparar con el token. */
    usuarioId: string;
    inicioClase: Date;
    cupoMaximo: number;
}
