import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AvisoBandejaRepository } from '@Avisos/repositories';
import {
  AvisoDetalleDto,
  AvisoResumenDto,
  type ConteoNoLeidosDto,
  type MarcarTodosLeidosDto,
  type MisAvisosResponseDto,
} from '@Avisos/dto';
import { EstadoAviso } from '@PrismaClient';

/** Avisos por página en la bandeja (convención del proyecto: listas de 20 en 20). */
export const AVISOS_POR_PAGINA = 20;

export const MENSAJES_BANDEJA = {
  noExiste: 'El aviso no existe.',
  ajeno: 'No tienes permiso para ver este recurso.',
} as const;

/**
 * Bandeja de avisos del miembro (H23, BE-23.1). El miembro siempre sale del
 * token (`usuarioId`): ningún método recibe un id de miembro, así que nadie
 * puede leer ni marcar avisos de otra persona.
 */
@Injectable()
export class AvisosBandejaService {
  constructor(private readonly repo: AvisoBandejaRepository) {}

  /** Página de avisos propios, del más reciente al más antiguo. */
  async listar(
    usuarioId: string,
    {
      soloNoLeidos = false,
      pagina = 1,
    }: { soloNoLeidos?: boolean; pagina?: number } = {},
  ): Promise<MisAvisosResponseDto> {
    const miembroId = await this.repo.findMiembroIdDeUsuario(usuarioId);
    if (!miembroId) return { items: [], total: 0, pagina };

    const { avisos, total } = await this.repo.listarDelMiembro(miembroId, {
      soloNoLeidos,
      saltar: (pagina - 1) * AVISOS_POR_PAGINA,
      tomar: AVISOS_POR_PAGINA,
    });
    return {
      items: avisos.map((a) => AvisoResumenDto.fromEntity(a)),
      total,
      pagina,
    };
  }

  /**
   * Devuelve el aviso completo y lo deja LEIDO.
   *
   * @throws NotFoundException si el aviso no existe.
   * @throws ForbiddenException si es de otro miembro.
   */
  async abrir(
    usuarioId: string,
    avisoId: string,
    ahora: Date = new Date(),
  ): Promise<AvisoDetalleDto> {
    const aviso = await this.repo.findPorId(avisoId);
    if (!aviso) throw new NotFoundException(MENSAJES_BANDEJA.noExiste);

    const miembroId = await this.repo.findMiembroIdDeUsuario(usuarioId);
    if (aviso.miembroId !== miembroId) {
      throw new ForbiddenException(MENSAJES_BANDEJA.ajeno);
    }

    const leido =
      aviso.estado === EstadoAviso.NO_LEIDO
        ? await this.repo.marcarLeido(aviso.id, ahora)
        : aviso;
    return AvisoDetalleDto.fromEntity(leido);
  }

  async contarNoLeidos(usuarioId: string): Promise<ConteoNoLeidosDto> {
    const miembroId = await this.repo.findMiembroIdDeUsuario(usuarioId);
    return {
      noLeidos: miembroId ? await this.repo.contarNoLeidos(miembroId) : 0,
    };
  }

  async marcarTodosLeidos(
    usuarioId: string,
    ahora: Date = new Date(),
  ): Promise<MarcarTodosLeidosDto> {
    const miembroId = await this.repo.findMiembroIdDeUsuario(usuarioId);
    return {
      actualizados: miembroId
        ? await this.repo.marcarTodosLeidos(miembroId, ahora)
        : 0,
    };
  }
}
