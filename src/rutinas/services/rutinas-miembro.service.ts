import { Injectable, NotFoundException } from '@nestjs/common';
import { assertOwnership } from '@Common/ownership';
import { RutinaMiembroRepository } from '../repositories/rutina-miembro.repository.js';
import { RutinaPropiaDetalleDto, RutinaPropiaResumenDto } from '../dto/rutina-propia-response.dto.js';

@Injectable()
export class RutinasMiembroService {
  constructor(private readonly repository: RutinaMiembroRepository) {}

  private async miembroIdDeUsuario(usuarioId: string): Promise<string> {
    const miembro = await this.repository.miembroDeUsuario(usuarioId);
    if (!miembro) throw new NotFoundException('No se encontró el perfil de miembro de tu cuenta.');
    return miembro.id;
  }

  async listar(usuarioId: string): Promise<RutinaPropiaResumenDto[]> {
    const miembroId = await this.miembroIdDeUsuario(usuarioId);
    return (await this.repository.listarPropias(miembroId)).map((r) => RutinaPropiaResumenDto.fromEntity(r));
  }

  async detalle(usuarioId: string, id: string): Promise<RutinaPropiaDetalleDto> {
    const miembroId = await this.miembroIdDeUsuario(usuarioId);
    const propietario = await this.repository.propietario(id);
    if (!propietario) throw new NotFoundException('La rutina no existe.');
    assertOwnership(propietario.miembroId, miembroId, 'No tienes permiso para consultar esta rutina.');
    const rutina = await this.repository.detallePropio(id, miembroId);
    if (!rutina) throw new NotFoundException('La rutina no existe.');
    return RutinaPropiaDetalleDto.fromEntity(rutina);
  }
}
