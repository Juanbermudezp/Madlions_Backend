import { ApiProperty } from '@nestjs/swagger';
import type { DetalleRutinaPropia, ResumenRutinaPropia } from '../repositories/rutina-miembro.repository.js';
import { DiaDeRutinaDto } from './rutina-response.dto.js';

export class EntrenadorDeRutinaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nombre!: string;
  @ApiProperty() apellido!: string;
}

export class RutinaPropiaResumenDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nombre!: string;
  @ApiProperty() objetivo!: string;
  @ApiProperty({ format: 'date' }) fechaInicio!: string;
  @ApiProperty({ type: EntrenadorDeRutinaDto }) entrenador!: EntrenadorDeRutinaDto;

  static fromEntity(rutina: ResumenRutinaPropia): RutinaPropiaResumenDto {
    return {
      id: rutina.id, nombre: rutina.nombre, objetivo: rutina.objetivo,
      fechaInicio: rutina.fechaInicio.toISOString().slice(0, 10),
      entrenador: { id: rutina.entrenador.id, nombre: rutina.entrenador.nombre, apellido: rutina.entrenador.apellido },
    };
  }
}

export class RutinaPropiaDetalleDto extends RutinaPropiaResumenDto {
  @ApiProperty({ type: [DiaDeRutinaDto] }) dias!: DiaDeRutinaDto[];

  static fromEntity(rutina: DetalleRutinaPropia): RutinaPropiaDetalleDto {
    const resumen = RutinaPropiaResumenDto.fromEntity(rutina);
    return {
      id: resumen.id, nombre: resumen.nombre, objetivo: resumen.objetivo,
      fechaInicio: resumen.fechaInicio, entrenador: resumen.entrenador,
      dias: rutina.dias.map((d) => ({ id: d.id, orden: d.orden, nombre: d.nombre,
        ejercicios: d.ejercicios.map((e) => ({ id: e.id, orden: e.orden, nombre: e.nombre,
          series: e.series, repeticiones: e.repeticiones, descansoSeg: e.descansoSeg })),
      })),
    };
  }
}
