import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
    IsInt,
    IsOptional,
    IsString,
    IsUUID,
    Matches,
    Max,
    MaxLength,
    Min,
} from 'class-validator';
import { CUPO_INVALIDO } from './create-clase.dto.js';

const trim = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value;

/**
 * Cuerpo de PATCH /clases/:id. Solo cambia lo que se envía; lo demás se toma
 * de la clase actual. Una descripción vacía ("") la borra.
 */
export class UpdateClaseDto {
    @ApiPropertyOptional({ format: 'uuid' })
    @IsOptional()
    @IsUUID('all', { message: 'El tipo de clase no es válido.' })
    tipoClaseId?: string;

    @ApiPropertyOptional({ format: 'uuid' })
    @IsOptional()
    @IsUUID('all', { message: 'El entrenador no es válido.' })
    entrenadorId?: string;

    @ApiPropertyOptional({ example: 'Clase para principiantes', maxLength: 300 })
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(300, { message: 'La descripción puede tener hasta 300 caracteres.' })
    descripcion?: string;

    @ApiPropertyOptional({ example: '2026-11-12' })
    @IsOptional()
    @IsString()
    @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe tener el formato AAAA-MM-DD.' })
    fecha?: string;

    @ApiPropertyOptional({ example: '07:00' })
    @IsOptional()
    @IsString()
    @Matches(/^\d{2}:\d{2}$/, { message: 'La hora de inicio debe tener el formato HH:MM.' })
    horaInicio?: string;

    @ApiPropertyOptional({ example: '08:00' })
    @IsOptional()
    @IsString()
    @Matches(/^\d{2}:\d{2}$/, { message: 'La hora de fin debe tener el formato HH:MM.' })
    horaFin?: string;

    @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 50 })
    @IsOptional()
    @IsInt({ message: CUPO_INVALIDO })
    @Min(1, { message: CUPO_INVALIDO })
    @Max(50, { message: CUPO_INVALIDO })
    cupoMaximo?: number;
}
