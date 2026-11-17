import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TipoProgreso } from '@PrismaClient';
import type { RegistroResumen, SerieProgreso } from '../services/progreso.service.js';

export class RegistroResumenDto implements RegistroResumen {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'date' }) fecha!: string;
  @ApiProperty({ example: 78.5 }) valor!: number;
}

export class SerieProgresoDto implements SerieProgreso {
  @ApiProperty({ enum: TipoProgreso }) tipo!: TipoProgreso;
  @ApiPropertyOptional() ejercicio?: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 100 }) repeticiones?: number;
  @ApiProperty({ type: [RegistroResumenDto], description: 'Más reciente primero.' }) registros!: RegistroResumenDto[];
  @ApiProperty({ type: Number, nullable: true }) primero!: number | null;
  @ApiProperty({ type: Number, nullable: true }) ultimo!: number | null;
  @ApiProperty({ type: Number, nullable: true }) diferencia!: number | null;
  @ApiProperty({ type: Number, nullable: true }) porcentaje!: number | null;
}

export class ProgresoResponseDto {
  @ApiProperty({ type: [SerieProgresoDto] }) series!: SerieProgresoDto[];
}
