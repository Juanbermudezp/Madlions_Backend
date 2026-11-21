import { ApiProperty } from '@nestjs/swagger';
import { EstadoAviso, ModuloOrigen, type Aviso } from '@PrismaClient';

/** Fila de la bandeja (H23): sin el mensaje, que se ve al abrir el aviso. */
export class AvisoResumenDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Clase cancelada: Yoga' }) titulo!: string;
  @ApiProperty({ enum: ModuloOrigen }) moduloOrigen!: ModuloOrigen;
  @ApiProperty({ example: '2026-11-20T21:30:00.000Z' }) creadoEn!: string;
  @ApiProperty({ enum: EstadoAviso }) estado!: EstadoAviso;

  static fromEntity(aviso: Aviso): AvisoResumenDto {
    return {
      id: aviso.id,
      titulo: aviso.titulo,
      moduloOrigen: aviso.moduloOrigen,
      creadoEn: aviso.creadoEn.toISOString(),
      estado: aviso.estado,
    };
  }
}

/** Respuesta de GET /avisos/mios: una página de 20, del más reciente al más antiguo. */
export class MisAvisosResponseDto {
  @ApiProperty({ type: AvisoResumenDto, isArray: true })
  items!: AvisoResumenDto[];

  @ApiProperty({
    example: 25,
    description:
      'Cantidad de avisos con el filtro aplicado, no solo de la página.',
  })
  total!: number;

  @ApiProperty({ example: 1 }) pagina!: number;
}

/** Aviso completo (GET /avisos/:id). Al abrirlo queda LEIDO. */
export class AvisoDetalleDto extends AvisoResumenDto {
  @ApiProperty({
    example:
      'La clase de Yoga del 21/11/2026 de 18:00 a 19:00 fue cancelada por el gimnasio.',
  })
  mensaje!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '2026-11-20T21:45:00.000Z',
  })
  leidoEn!: string | null;

  static override fromEntity(aviso: Aviso): AvisoDetalleDto {
    return {
      id: aviso.id,
      titulo: aviso.titulo,
      moduloOrigen: aviso.moduloOrigen,
      creadoEn: aviso.creadoEn.toISOString(),
      estado: aviso.estado,
      mensaje: aviso.mensaje,
      leidoEn: aviso.leidoEn ? aviso.leidoEn.toISOString() : null,
    };
  }
}

/** Respuesta de GET /avisos/no-leidos/conteo. */
export class ConteoNoLeidosDto {
  @ApiProperty({ example: 3 }) noLeidos!: number;
}

/** Respuesta de POST /avisos/marcar-todos-leidos. */
export class MarcarTodosLeidosDto {
  @ApiProperty({
    example: 3,
    description: 'Avisos que pasaron de NO_LEIDO a LEIDO.',
  })
  actualizados!: number;
}
