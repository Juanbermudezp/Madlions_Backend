import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import type { Comprobante, ConceptoCobro } from '@PrismaClient';

/** Comprobante con lo que se muestra al consultarlo (y el dueño, para la pertenencia). */
export type ComprobanteCompleto = Comprobante & {
    cobro: {
        concepto: ConceptoCobro;
        detalle: string;
        miembro: { codigoMiembro: string; usuario: { id: string; nombre: string; apellido: string } };
    };
    intento: { referencia: string; ultimos4: string };
};

/** Único punto que lee la tabla `comprobante`. Los crea CobroRepository al confirmar un pago. */
@Injectable()
export class ComprobanteRepository {
    constructor(private readonly prisma: PrismaService) { }

    findPorNumero(numero: string): Promise<ComprobanteCompleto | null> {
        return this.prisma.comprobante.findUnique({
            where: { numero },
            include: {
                cobro: {
                    select: {
                        concepto: true,
                        detalle: true,
                        miembro: {
                            select: {
                                codigoMiembro: true,
                                usuario: { select: { id: true, nombre: true, apellido: true } },
                            },
                        },
                    },
                },
                intento: { select: { referencia: true, ultimos4: true } },
            },
        });
    }
}
