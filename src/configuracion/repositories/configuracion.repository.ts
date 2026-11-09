import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import type { Configuracion } from '@PrismaClient';

/** Único punto que habla con la tabla `configuracion`. */
@Injectable()
export class ConfiguracionRepository {
    constructor(private readonly prisma: PrismaService) { }

    findByClave(clave: string): Promise<Configuracion | null> {
        return this.prisma.configuracion.findUnique({ where: { clave } });
    }

    /**
     * Guarda el valor de una clave. Usa upsert para que funcione aunque la
     * fila inicial de la migración no exista; actualizado_en lo pone Prisma.
     */
    guardar(clave: string, valor: string): Promise<Configuracion> {
        return this.prisma.configuracion.upsert({
            where: { clave },
            update: { valor },
            create: { clave, valor },
        });
    }
}
