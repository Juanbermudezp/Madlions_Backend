import { ApiProperty } from '@nestjs/swagger';
import type { RutinaCompleta } from '../repositories/rutina.repository.js';
import { RutinaEjercicioDto } from './update-rutina.dto.js';

export class EjercicioDeRutinaDto extends RutinaEjercicioDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ minimum: 1, maximum: 15 }) orden!: number;
}

export class DiaDeRutinaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ minimum: 1, maximum: 7 }) orden!: number;
  @ApiProperty() nombre!: string;
  @ApiProperty({ type: [EjercicioDeRutinaDto] }) ejercicios!: EjercicioDeRutinaDto[];
}

export class MiembroDeRutinaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() codigo!: string;
  @ApiProperty() nombre!: string;
  @ApiProperty() apellido!: string;
}

export class RutinaResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) miembroId!: string;
  @ApiProperty({ format: 'uuid' }) entrenadorId!: string;
  @ApiProperty() nombre!: string;
  @ApiProperty() objetivo!: string;
  @ApiProperty({ format: 'date' }) fechaInicio!: string;
  @ApiProperty({ format: 'date-time' }) creadoEn!: string;
  @ApiProperty({ format: 'date-time' }) actualizadoEn!: string;
  @ApiProperty({ type: MiembroDeRutinaDto }) miembro!: MiembroDeRutinaDto;
  @ApiProperty({ type: [DiaDeRutinaDto] }) dias!: DiaDeRutinaDto[];

  static fromEntity(rutina: RutinaCompleta): RutinaResponseDto {
    return {
      id: rutina.id, miembroId: rutina.miembroId, entrenadorId: rutina.entrenadorId,
      nombre: rutina.nombre, objetivo: rutina.objetivo, fechaInicio: rutina.fechaInicio.toISOString().slice(0, 10),
      creadoEn: rutina.creadoEn.toISOString(), actualizadoEn: rutina.actualizadoEn.toISOString(),
      miembro: { id: rutina.miembro.id, codigo: rutina.miembro.codigoMiembro,
        nombre: rutina.miembro.usuario.nombre, apellido: rutina.miembro.usuario.apellido },
      dias: rutina.dias.map((dia) => ({ id: dia.id, orden: dia.orden, nombre: dia.nombre,
        ejercicios: dia.ejercicios.map((e) => ({ id: e.id, orden: e.orden, nombre: e.nombre,
          series: e.series, repeticiones: e.repeticiones, descansoSeg: e.descansoSeg })),
      })),
    };
  }
}
