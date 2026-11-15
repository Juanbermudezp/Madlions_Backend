import { Injectable } from '@nestjs/common';
import { CobroRepository, type DatosCobro } from '@Cobros/repositories';
import type { Cobro, Prisma } from '@PrismaClient';

/** Cobros (Módulo 5). */
@Injectable()
export class CobrosService {
    constructor(private readonly cobroRepository: CobroRepository) { }

    /**
     * Genera un cobro PENDIENTE. Quien lo pide pasa su transacción (`tx`) para
     * que, si algo falla, no quede ni el cobro ni el registro que lo originó.
     */
    crearCobro(datos: DatosCobro, tx?: Prisma.TransactionClient): Promise<Cobro> {
        return this.cobroRepository.create(datos, tx);
    }
}
