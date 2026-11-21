import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { EstadoAviso, type Aviso, type Prisma } from '@PrismaClient';

export interface PaginaAvisos {
  avisos: Aviso[];
  total: number;
}

/**
 * Lecturas de la bandeja del miembro (H23). Todas las consultas filtran por
 * miembro_id y usan los índices (miembro_id, creado_en) y (miembro_id, estado)
 * de DB-22.1.
 */
@Injectable()
export class AvisoBandejaRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Ficha de miembro del usuario del token, o null si no tiene. */
  async findMiembroIdDeUsuario(usuarioId: string): Promise<string | null> {
    const miembro = await this.prisma.miembro.findUnique({
      where: { usuarioId },
      select: { id: true },
    });
    return miembro?.id ?? null;
  }

  /**
   * Una página de avisos del miembro, del más reciente al más antiguo, y el
   * total con el mismo filtro. El id desempata para que la paginación sea
   * estable cuando dos avisos se crean en el mismo milisegundo.
   */
  async listarDelMiembro(
    miembroId: string,
    opciones: { soloNoLeidos: boolean; saltar: number; tomar: number },
  ): Promise<PaginaAvisos> {
    const where: Prisma.AvisoWhereInput = {
      miembroId,
      ...(opciones.soloNoLeidos ? { estado: EstadoAviso.NO_LEIDO } : {}),
    };
    const [avisos, total] = await this.prisma.$transaction([
      this.prisma.aviso.findMany({
        where,
        orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
        skip: opciones.saltar,
        take: opciones.tomar,
      }),
      this.prisma.aviso.count({ where }),
    ]);
    return { avisos, total };
  }

  findPorId(id: string): Promise<Aviso | null> {
    return this.prisma.aviso.findUnique({ where: { id } });
  }

  /**
   * Marca el aviso como LEIDO si todavía no lo estaba y devuelve cómo quedó.
   * El filtro por estado evita pisar la fecha de lectura original.
   */
  async marcarLeido(id: string, ahora: Date): Promise<Aviso> {
    await this.prisma.aviso.updateMany({
      where: { id, estado: EstadoAviso.NO_LEIDO },
      data: { estado: EstadoAviso.LEIDO, leidoEn: ahora },
    });
    return this.prisma.aviso.findUniqueOrThrow({ where: { id } });
  }

  contarNoLeidos(miembroId: string): Promise<number> {
    return this.prisma.aviso.count({
      where: { miembroId, estado: EstadoAviso.NO_LEIDO },
    });
  }

  /** Pasa a LEIDO todos los avisos sin leer del miembro y devuelve cuántos cambió. */
  async marcarTodosLeidos(miembroId: string, ahora: Date): Promise<number> {
    const { count } = await this.prisma.aviso.updateMany({
      where: { miembroId, estado: EstadoAviso.NO_LEIDO },
      data: { estado: EstadoAviso.LEIDO, leidoEn: ahora },
    });
    return count;
  }
}
