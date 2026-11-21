import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value;

export const NOMBRE_TIPO_CLASE_INVALIDO = 'El nombre debe tener entre 2 y 40 caracteres.';
export const DESCRIPCION_TIPO_CLASE_INVALIDA = 'La descripción es obligatoria y puede tener hasta 300 caracteres.';

/** Cuerpo de POST /tipos-clase (H4, BE-4.1). */
export class CreateTipoClaseDto {
    @ApiProperty({ example: 'Yoga', minLength: 2, maxLength: 40 })
    @Transform(trim)
    @IsString({ message: NOMBRE_TIPO_CLASE_INVALIDO })
    @MinLength(2, { message: NOMBRE_TIPO_CLASE_INVALIDO })
    @MaxLength(40, { message: NOMBRE_TIPO_CLASE_INVALIDO })
    nombre!: string;

    @ApiProperty({ example: 'Posturas, respiración y flexibilidad.', minLength: 1, maxLength: 300 })
    @Transform(trim)
    @IsString({ message: DESCRIPCION_TIPO_CLASE_INVALIDA })
    @MinLength(1, { message: DESCRIPCION_TIPO_CLASE_INVALIDA })
    @MaxLength(300, { message: DESCRIPCION_TIPO_CLASE_INVALIDA })
    descripcion!: string;
}
