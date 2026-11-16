import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import type {
    Cobro,
    ConceptoCobro,
    EstadoCobro,
    Prisma,
    ReferenciaCobro,
} from '@PrismaClient';

/** Datos de un cobro nuevo. */
export interface DatosCobro {
    miembroId: string;
    concepto: ConceptoCobro;
    /** Plan de la membresía, o fecha y entrenador de la sesión (máximo 150 caracteres). */
    detalle: string;
    monto: number | Prisma.Decimal;
    referenciaTipo: ReferenciaCobro;
    referenciaId: string;
    /** Desde cuándo se puede pagar (renovaciones); null = desde que se genera. */
    habilitadoDesde?: Date | null;
}

/** Cobro con el número de su comprobante, si ya se pagó. */
export type CobroConComprobante = Cobro & { comprobante: { numero: string } | null };

/** Único punto que habla con la tabla `cobro`. */
@Injectable()
export class CobroRepository {
    constructor(private readonly prisma: PrismaService) { }

    /**
     * Crea el cobro. Si llega `tx`, se escribe dentro de esa transacción, así
     * el registro que lo origina y el cobro se guardan juntos o no se guarda
     * ninguno.
     */
    create(data: DatosCobro, tx?: Prisma.TransactionClient): Promise<Cobro> {
        return (tx ?? this.prisma).cobro.create({ data });
    }

    /**
     * Cobros del miembro que pertenece al usuario. El filtro va por la
     * relación cobro → miembro → usuario, así nunca se devuelven cobros ajenos.
     */
    findDeUsuario(usuarioId: string, estado?: EstadoCobro): Promise<CobroConComprobante[]> {
        return this.prisma.cobro.findMany({
            where: { miembro: { usuarioId }, ...(estado ? { estado } : {}) },
            include: { comprobante: { select: { numero: true } } },
            orderBy: { creadoEn: 'desc' },
        });
    }
}
