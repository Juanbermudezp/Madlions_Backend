import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsEnum, IsUUID, ValidateNested } from 'class-validator';

/** Una actividad del entrenador: una clase grupal (H5) o una sesión personal (H9). */
export enum TipoActividad {
    CLASE = 'CLASE',
    SESION = 'SESION',
}

/** Lo que el entrenador puede marcar: "sin registrar" no se envía. */
export enum MarcaAsistencia {
    ASISTIO = 'ASISTIO',
    NO_ASISTIO = 'NO_ASISTIO',
}

export const TIPO_INVALIDO = 'El tipo debe ser CLASE o SESION.';
export const REGISTRO_INVALIDO = 'El registro no es válido.';
export const ASISTENCIA_INVALIDA = 'La asistencia debe ser ASISTIO o NO_ASISTIO.';
export const MARCAS_VACIAS = 'Envía al menos una marca de asistencia.';
export const MARCAS_REPETIDAS = 'Hay dos marcas para el mismo registro.';

/** Tope por petición: "Marcar todos" manda una clase entera de una vez. */
const MAXIMO_MARCAS = 100;

export class MarcaAsistenciaDto {
    @ApiProperty({ enum: TipoActividad, example: TipoActividad.CLASE })
    @IsEnum(TipoActividad, { message: TIPO_INVALIDO })
    tipo!: TipoActividad;

    @ApiProperty({
        format: 'uuid',
        description: 'Id de la reserva (CLASE) o de la sesión personal (SESION).',
    })
    @IsUUID('all', { message: REGISTRO_INVALIDO })
    registroId!: string;

    @ApiProperty({ enum: MarcaAsistencia, example: MarcaAsistencia.ASISTIO })
    @IsEnum(MarcaAsistencia, { message: ASISTENCIA_INVALIDA })
    asistencia!: MarcaAsistencia;
}

// Cuerpo de PUT /asistencia (H19).
export class MarcarAsistenciaDto {
    @ApiProperty({ type: MarcaAsistenciaDto, isArray: true })
    @IsArray({ message: MARCAS_VACIAS })
    @ArrayNotEmpty({ message: MARCAS_VACIAS })
    @ArrayMaxSize(MAXIMO_MARCAS, { message: `Envía como máximo ${MAXIMO_MARCAS} marcas por vez.` })
    @ValidateNested({ each: true })
    @Type(() => MarcaAsistenciaDto)
    marcas!: MarcaAsistenciaDto[];
}
