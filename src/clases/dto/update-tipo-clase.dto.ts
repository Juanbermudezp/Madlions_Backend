import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import {
    DESCRIPCION_TIPO_CLASE_INVALIDA,
    NOMBRE_TIPO_CLASE_INVALIDO,
} from './create-tipo-clase.dto.js';

const trim = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value;

/** Cuerpo de PATCH /tipos-clase/:id. Solo cambia los campos que se envían. */
export class UpdateTipoClaseDto {
    @ApiPropertyOptional({ example: 'Yoga', minLength: 2, maxLength: 40 })
    @IsOptional()
    @Transform(trim)
    @IsString({ message: NOMBRE_TIPO_CLASE_INVALIDO })
    @MinLength(2, { message: NOMBRE_TIPO_CLASE_INVALIDO })
    @MaxLength(40, { message: NOMBRE_TIPO_CLASE_INVALIDO })
    nombre?: string;

    @ApiPropertyOptional({ example: 'Posturas, respiración y flexibilidad.', minLength: 1, maxLength: 300 })
    @IsOptional()
    @Transform(trim)
    @IsString({ message: DESCRIPCION_TIPO_CLASE_INVALIDA })
    @MinLength(1, { message: DESCRIPCION_TIPO_CLASE_INVALIDA })
    @MaxLength(300, { message: DESCRIPCION_TIPO_CLASE_INVALIDA })
    descripcion?: string;
}
