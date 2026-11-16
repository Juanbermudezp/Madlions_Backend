import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import type {
    Cobro,
    ConceptoCobro,
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
}

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
}
