import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { EstadoClase, type Clase, type TipoClase } from '@PrismaClient';

/** Único punto que habla con la tabla `clase`. */
@Injectable()
export class ClaseRepository {
  constructor(private readonly prisma: PrismaService) {}

  findProgramadasDelEntrenadorEntre(
    entrenadorId: string,
    desde: Date,
    hasta: Date,
  ): Promise<(Clase & { tipoClase: TipoClase })[]> {
    return this.prisma.clase.findMany({
      where: {
        entrenadorId,
        estado: EstadoClase.PROGRAMADA,
        inicio: { lt: hasta },
        fin: { gt: desde },
      },
      include: { tipoClase: true },
      orderBy: { inicio: 'asc' },
    });
  }
}