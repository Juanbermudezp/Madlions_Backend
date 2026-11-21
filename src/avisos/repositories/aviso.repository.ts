import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { MiembrosInexistentesError } from '@Avisos/errors';
import { Prisma, type ModuloOrigen } from '@PrismaClient';

export interface CrearAvisosData {
  miembroIds: string[];
  titulo: string;
  mensaje: string;
  moduloOrigen: ModuloOrigen;
  referencia?: string;
}

@Injectable()
export class AvisoRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra un aviso NO_LEIDO por miembro en una sola transacción y devuelve
   * cuántos se crearon. Si algún id no es un miembro, no registra ninguno.
   *
   * Los que ya tenían un aviso con la misma referencia se omiten: el índice
   * único (miembro_id, referencia) más skipDuplicates genera
   * INSERT ... ON CONFLICT DO NOTHING.
   */
  async crearParaMiembros(data: CrearAvisosData): Promise<number> {
    const { miembroIds, ...aviso } = data;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existentes = await tx.miembro.findMany({
          where: { id: { in: miembroIds } },
          select: { id: true },
        });

        if (existentes.length !== miembroIds.length) {
          const encontrados = new Set(existentes.map(({ id }) => id));
          throw new MiembrosInexistentesError(
            miembroIds.filter((id) => !encontrados.has(id)),
          );
        }

        const { count } = await tx.aviso.createMany({
          data: miembroIds.map((miembroId) => ({ miembroId, ...aviso })),
          skipDuplicates: true,
        });
        return count;
      });
    } catch (error) {
      // Un miembro eliminado entre la consulta y el INSERT rompe la FK.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new MiembrosInexistentesError([]);
      }
      throw error;
    }
  }
}
