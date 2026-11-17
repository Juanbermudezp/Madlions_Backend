import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { EstadoReserva, type Clase, type Reserva, type TipoClase } from '@PrismaClient';

/** Reserva con los datos de su clase que muestra "Mis reservas". */
export type ReservaConClase = Reserva & {
    clase: Clase & {
        tipoClase: TipoClase;
        entrenador: { id: string; nombre: string; apellido: string };
    };
};

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
}
