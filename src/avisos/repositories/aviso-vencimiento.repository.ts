import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { EstadoMembresia, TipoPlan } from '@PrismaClient';

/** AAAA-MM-DD a la fecha (columna DATE) que espera Prisma. */
const aColumnaFecha = (fecha: string) => new Date(`${fecha}T00:00:00.000Z`);

/**
 * Consulta de la tarea de avisos de vencimiento (H24, BE-24.1). Solo encuentra
 * candidatos: quién recibe el aviso lo decide el estado de la membresía
 * (EstadoMembresiaService, BE-2.4), que es la fuente única del estado.
 */
@Injectable()
export class AvisoVencimientoRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Miembros con una membresía PAGADA Mensual o Set de clases que vence entre
   * `desde` y `hasta` (AAAA-MM-DD, inclusive). El Daypass queda fuera porque
   * vence el mismo día en que se paga.
   */
  async miembrosConVencimientoEntre(
    desde: string,
    hasta: string,
  ): Promise<string[]> {
    const filas = await this.prisma.membresia.findMany({
      where: {
        estado: EstadoMembresia.PAGADA,
        tipoPlan: { in: [TipoPlan.MENSUAL, TipoPlan.SET_CLASES] },
        fechaVencimiento: {
          gte: aColumnaFecha(desde),
          lte: aColumnaFecha(hasta),
        },
      },
      select: { miembroId: true },
      distinct: ['miembroId'],
    });
    return filas.map((f) => f.miembroId);
  }
}
