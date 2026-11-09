import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
    IsIn,
    IsOptional,
    IsString,
    IsUUID,
    Matches,
    MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value;

export const CUPO_INVALIDO = 'El cupo máximo debe ser un número entero de 1 a 50.';

/**
 * Enteros de 1 a 50. Se valida con un solo @IsIn (y no con IsInt + Min + Max)
 * para que un cupo faltante o inválido devuelva un único mensaje.
 */
export const CUPOS_VALIDOS: readonly number[] = Array.from({ length: 50 }, (_, i) => i + 1);

/** Cuerpo de POST /clases (H4, BE-4.2). Horas en hora de El Salvador. */
export class CreateClaseDto {
    @ApiProperty({ format: 'uuid' })
    @IsUUID('all', { message: 'El tipo de clase no es válido.' })
    tipoClaseId!: string;

    @ApiProperty({ format: 'uuid' })
    @IsUUID('all', { message: 'El entrenador no es válido.' })
    entrenadorId!: string;

    @ApiPropertyOptional({ example: 'Clase para principiantes', maxLength: 300 })
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(300, { message: 'La descripción puede tener hasta 300 caracteres.' })
    descripcion?: string;

    @ApiProperty({ example: '2026-11-12', description: 'Fecha de la clase (AAAA-MM-DD).' })
    @IsString()
    @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe tener el formato AAAA-MM-DD.' })
    fecha!: string;

    @ApiProperty({ example: '07:00', description: 'Hora de inicio (HH:MM).' })
    @IsString()
    @Matches(/^\d{2}:\d{2}$/, { message: 'La hora de inicio debe tener el formato HH:MM.' })
    horaInicio!: string;

    @ApiProperty({ example: '08:00', description: 'Hora de fin (HH:MM), posterior al inicio.' })
    @IsString()
    @Matches(/^\d{2}:\d{2}$/, { message: 'La hora de fin debe tener el formato HH:MM.' })
    horaFin!: string;

    @ApiProperty({ example: 20, minimum: 1, maximum: 50 })
    @IsIn(CUPOS_VALIDOS, { message: CUPO_INVALIDO })
    cupoMaximo!: number;
}
