import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Length, Max, Min, IsUUID } from 'class-validator';

/** Lo que se califica: una clase grupal (H5) o una sesión personal (H9). */
export enum TipoActividad {
    CLASE = 'CLASE',
    SESION = 'SESION',
}

export const TIPO_INVALIDO = 'El tipo debe ser CLASE o SESION.';
export const REGISTRO_INVALIDO = 'El registro no es válido.';
export const CALIFICACION_INVALIDA = 'Cada calificación debe ser un entero de 1 a 5.';
export const COMENTARIO_INVALIDO = 'El comentario puede tener hasta 500 caracteres.';

const recortar = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value;

// El formulario manda el comentario vacío cuando no se escribió nada.
const vacioEsSinComentario = ({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : recortar({ value });

// Cuerpo de POST /resenas (H20). Las tres calificaciones son opcionales y
// llevan las mismas reglas: entero de 1 a 5.
export class CrearResenaDto {
    @ApiProperty({ enum: TipoActividad, example: TipoActividad.CLASE })
    @IsEnum(TipoActividad, { message: TIPO_INVALIDO })
    tipo!: TipoActividad;

    @ApiProperty({
        format: 'uuid',
        description: 'Id de la reserva (CLASE) o de la sesión personal (SESION).',
    })
    @IsUUID('all', { message: REGISTRO_INVALIDO })
    registroId!: string;

    @ApiPropertyOptional({ minimum: 1, maximum: 5, example: 5 })
    @IsOptional()
    @IsInt({ message: CALIFICACION_INVALIDA })
    @Min(1, { message: CALIFICACION_INVALIDA })
    @Max(5, { message: CALIFICACION_INVALIDA })
    calActividad?: number;

    @ApiPropertyOptional({ minimum: 1, maximum: 5, example: 4 })
    @IsOptional()
    @IsInt({ message: CALIFICACION_INVALIDA })
    @Min(1, { message: CALIFICACION_INVALIDA })
    @Max(5, { message: CALIFICACION_INVALIDA })
    calEntrenador?: number;

    @ApiPropertyOptional({ minimum: 1, maximum: 5, example: 5 })
    @IsOptional()
    @IsInt({ message: CALIFICACION_INVALIDA })
    @Min(1, { message: CALIFICACION_INVALIDA })
    @Max(5, { message: CALIFICACION_INVALIDA })
    calInstalaciones?: number;

    @ApiPropertyOptional({ maxLength: 500, example: 'La clase estuvo muy buena.' })
    @Transform(vacioEsSinComentario)
    @IsOptional()
    @IsString({ message: COMENTARIO_INVALIDO })
    @Length(1, 500, { message: COMENTARIO_INVALIDO })
    comentario?: string;
}
