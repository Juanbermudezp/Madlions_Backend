import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** El tipo de una medición no se cambia: se edita el registro existente. */
export class UpdateProgresoDto {
  @ApiPropertyOptional({ example: '2026-11-06', format: 'date' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fecha?: string;

  @ApiPropertyOptional({ example: 77.2 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  valor?: number;

  @ApiPropertyOptional({ example: 'Press banca' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  ejercicio?: string;

  @ApiPropertyOptional({ example: 8 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  repeticiones?: number;
}
