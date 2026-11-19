import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsObject, IsString, Length, Matches, Max, Min, ValidateNested } from 'class-validator';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class RutinaEjercicioDto {
  @ApiProperty({ minLength: 1, maxLength: 60 })
  @Transform(trim)
  @IsString()
  @Length(1, 60)
  nombre!: string;

  @ApiProperty({ minimum: 1, maximum: 10 })
  @IsInt()
  @Min(1)
  @Max(10)
  series!: number;

  @ApiProperty({ minimum: 1, maximum: 50 })
  @IsInt()
  @Min(1)
  @Max(50)
  repeticiones!: number;

  @ApiProperty({ minimum: 0, maximum: 600 })
  @IsInt()
  @Min(0)
  @Max(600)
  descansoSeg!: number;
}

export class RutinaDiaDto {
  @ApiProperty({ minLength: 1, maxLength: 40 })
  @Transform(trim)
  @IsString()
  @Length(1, 40)
  nombre!: string;

  @ApiProperty({ type: [RutinaEjercicioDto], minItems: 1, maxItems: 15 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(15)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => RutinaEjercicioDto)
  ejercicios!: RutinaEjercicioDto[];
}

/** PUT reemplaza todos los datos editables; no admite propietarios ni auditoría. */
export class UpdateRutinaDto {
  @ApiProperty({ minLength: 3, maxLength: 60 })
  @Transform(trim)
  @IsString()
  @Length(3, 60)
  nombre!: string;

  @ApiProperty({ minLength: 1, maxLength: 200 })
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  objetivo!: string;

  @ApiProperty({ format: 'date', example: '2026-11-18' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fechaInicio!: string;

  @ApiProperty({ type: [RutinaDiaDto], minItems: 1, maxItems: 7 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => RutinaDiaDto)
  dias!: RutinaDiaDto[];
}
