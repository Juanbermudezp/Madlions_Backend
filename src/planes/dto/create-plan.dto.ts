import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
    ArrayUnique,
    IsArray,
    IsEnum,
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    MaxLength,
    Min,
    MinLength,
} from 'class-validator';
import { TipoPlan } from '@PrismaClient';

const trim = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value;

/** Mayor valor que cabe en DECIMAL(10,2). */
export const PRECIO_MAXIMO = 99_999_999.99;

export const NOMBRE_PLAN_INVALIDO = 'El nombre es obligatorio y puede tener hasta 60 caracteres.';
export const TIPO_PLAN_INVALIDO = 'El tipo debe ser DAYPASS, MENSUAL o SET_CLASES.';
export const PRECIO_PLAN_INVALIDO = 'El precio debe ser mayor que 0 y tener como máximo 2 decimales.';
export const CANTIDAD_CLASES_INVALIDA = 'La cantidad de clases debe ser un entero entre 1 y 100.';
export const BENEFICIOS_PLAN_INVALIDOS = 'Los beneficios son obligatorios y pueden tener hasta 500 caracteres.';
export const TIPOS_CLASE_IDS_INVALIDOS = 'tiposClaseIds debe ser una lista de ids de tipos de clase sin repetir.';

/**
 * Cuerpo de POST /planes (H1).
 *
 * duracionDias no se recibe: la define el tipo (1 en DAYPASS, 30 en los
 * demás). La regla de cantidadClases según el tipo la aplica PlanesService.
 */
export class CreatePlanDto {
    @ApiProperty({ example: 'Mensual ilimitado', minLength: 1, maxLength: 60 })
    @Transform(trim)
    @IsString({ message: NOMBRE_PLAN_INVALIDO })
    @MinLength(1, { message: NOMBRE_PLAN_INVALIDO })
    @MaxLength(60, { message: NOMBRE_PLAN_INVALIDO })
    nombre!: string;

    @ApiProperty({ enum: TipoPlan, example: TipoPlan.MENSUAL })
    @IsEnum(TipoPlan, { message: TIPO_PLAN_INVALIDO })
    tipo!: TipoPlan;

    @ApiProperty({ example: 35.5, exclusiveMinimum: true, minimum: 0, maximum: PRECIO_MAXIMO })
    @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false }, { message: PRECIO_PLAN_INVALIDO })
    @Min(0.01, { message: PRECIO_PLAN_INVALIDO })
    @Max(PRECIO_MAXIMO, { message: PRECIO_PLAN_INVALIDO })
    precio!: number;

    @ApiPropertyOptional({
        example: 10,
        minimum: 1,
        maximum: 100,
        description: 'Obligatorio solo en SET_CLASES; no se envía en los demás tipos.',
    })
    @IsOptional()
    @IsInt({ message: CANTIDAD_CLASES_INVALIDA })
    @Min(1, { message: CANTIDAD_CLASES_INVALIDA })
    @Max(100, { message: CANTIDAD_CLASES_INVALIDA })
    cantidadClases?: number;

    @ApiProperty({ example: 'Acceso ilimitado a sala de máquinas.', minLength: 1, maxLength: 500 })
    @Transform(trim)
    @IsString({ message: BENEFICIOS_PLAN_INVALIDOS })
    @MinLength(1, { message: BENEFICIOS_PLAN_INVALIDOS })
    @MaxLength(500, { message: BENEFICIOS_PLAN_INVALIDOS })
    beneficios!: string;

    @ApiProperty({ type: String, format: 'uuid', isArray: true })
    @IsArray({ message: TIPOS_CLASE_IDS_INVALIDOS })
    @ArrayUnique({ message: TIPOS_CLASE_IDS_INVALIDOS })
    @IsUUID('all', { each: true, message: TIPOS_CLASE_IDS_INVALIDOS })
    tiposClaseIds!: string[];
}
