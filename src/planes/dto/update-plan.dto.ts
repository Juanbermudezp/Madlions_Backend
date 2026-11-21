import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
    Allow,
    ArrayUnique,
    IsArray,
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
import {
    BENEFICIOS_PLAN_INVALIDOS,
    CANTIDAD_CLASES_INVALIDA,
    NOMBRE_PLAN_INVALIDO,
    PRECIO_MAXIMO,
    PRECIO_PLAN_INVALIDO,
    TIPOS_CLASE_IDS_INVALIDOS,
} from './create-plan.dto.js';

const trim = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value;

/**
 * Cuerpo de PATCH /planes/:id (H1). Solo cambia los campos que se envían.
 *
 * `tipo` se acepta pero se ignora: el tipo de un plan no cambia al editarlo.
 * Se declara con @Allow para que el ValidationPipe (forbidNonWhitelisted) no
 * responda 400 por recibirlo.
 */
export class UpdatePlanDto {
    @ApiPropertyOptional({ example: 'Mensual ilimitado', minLength: 1, maxLength: 60 })
    @IsOptional()
    @Transform(trim)
    @IsString({ message: NOMBRE_PLAN_INVALIDO })
    @MinLength(1, { message: NOMBRE_PLAN_INVALIDO })
    @MaxLength(60, { message: NOMBRE_PLAN_INVALIDO })
    nombre?: string;

    @ApiPropertyOptional({ example: 35.5, exclusiveMinimum: true, minimum: 0, maximum: PRECIO_MAXIMO })
    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false }, { message: PRECIO_PLAN_INVALIDO })
    @Min(0.01, { message: PRECIO_PLAN_INVALIDO })
    @Max(PRECIO_MAXIMO, { message: PRECIO_PLAN_INVALIDO })
    precio?: number;

    @ApiPropertyOptional({
        example: 10,
        minimum: 1,
        maximum: 100,
        description: 'Solo aplica a planes SET_CLASES.',
    })
    @IsOptional()
    @IsInt({ message: CANTIDAD_CLASES_INVALIDA })
    @Min(1, { message: CANTIDAD_CLASES_INVALIDA })
    @Max(100, { message: CANTIDAD_CLASES_INVALIDA })
    cantidadClases?: number | null;

    @ApiPropertyOptional({ example: 'Acceso ilimitado a sala de máquinas.', minLength: 1, maxLength: 500 })
    @IsOptional()
    @Transform(trim)
    @IsString({ message: BENEFICIOS_PLAN_INVALIDOS })
    @MinLength(1, { message: BENEFICIOS_PLAN_INVALIDOS })
    @MaxLength(500, { message: BENEFICIOS_PLAN_INVALIDOS })
    beneficios?: string;

    @ApiPropertyOptional({
        type: String,
        format: 'uuid',
        isArray: true,
        description: 'Reemplaza por completo los tipos de clase del plan.',
    })
    @IsOptional()
    @IsArray({ message: TIPOS_CLASE_IDS_INVALIDOS })
    @ArrayUnique({ message: TIPOS_CLASE_IDS_INVALIDOS })
    @IsUUID('all', { each: true, message: TIPOS_CLASE_IDS_INVALIDOS })
    tiposClaseIds?: string[];

    /** Se ignora: el tipo de un plan no se puede cambiar. */
    @ApiPropertyOptional({ description: 'Se ignora: el tipo de un plan no se puede cambiar.' })
    @Allow()
    tipo?: unknown;
}
