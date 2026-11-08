import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TipoProgreso } from '@PrismaClient';

export class MedicionDto {
  @ApiProperty({ enum: TipoProgreso, example: TipoProgreso.PESO })
  @IsEnum(TipoProgreso)
  tipo!: TipoProgreso;

  @ApiProperty({ example: 76.5, description: 'Kg o cm según tipo; máximo un decimal.' })
  @IsNumber({ maxDecimalPlaces: 1 })
  valor!: number;

  @ApiPropertyOptional({ example: 'Press banca', maxLength: 60 })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  ejercicio?: string;

  @ApiPropertyOptional({ example: 8, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  repeticiones?: number;
}

export class CreateProgresoDto {
  @ApiProperty({ example: '2026-11-07', format: 'date' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha debe tener formato AAAA-MM-DD.',
  })
  fecha!: string;

  @ApiProperty({ type: [MedicionDto], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1, { message: 'Registra al menos una medición.' })
  @ValidateNested({ each: true })
  @Type(() => MedicionDto)
  mediciones!: MedicionDto[];
}
