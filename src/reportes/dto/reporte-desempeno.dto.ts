import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { RangoReporteQueryDto } from './rango-reporte-query.dto.js';

/**
 * Query de GET /reportes/desempeno (BE-29.1): el rango de H26 y, para el
 * administrador, un entrenador opcional. Si consulta un entrenador, se ignora
 * `entrenadorId` y siempre se usan sus propios datos.
 */
export class DesempenoQueryDto extends RangoReporteQueryDto {
    @ApiPropertyOptional({ format: 'uuid', description: 'Solo administrador: filtra a un entrenador.' })
    @IsOptional()
    @IsUUID('all', { message: 'El entrenador no es válido.' })
    entrenadorId?: string;
}

class EntrenadorDesempenoDto {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty({ example: 'Carlos Méndez' })
    nombre!: string;
}

export class FilaDesempenoDto {
    @ApiProperty({ type: EntrenadorDesempenoDto })
    entrenador!: EntrenadorDesempenoDto;

    @ApiProperty({ example: 12, description: 'Clases PROGRAMADA con hora de fin pasada (igual que H26).' })
    clasesImpartidas!: number;

    @ApiProperty({
        example: 62.5,
        nullable: true,
        type: Number,
        description: 'Reservas confirmadas ÷ cupo total × 100 de esas clases (fórmula de H26). Null sin clases impartidas.',
    })
    ocupacionPromedio!: number | null;

    @ApiProperty({ example: 5, description: 'Sesiones personales con hora de fin pasada y asistencia "Asistió" (H19).' })
    sesionesRealizadas!: number;

    @ApiProperty({
        example: 4.3,
        nullable: true,
        type: Number,
        description: 'Promedio como entrenador con un decimal; null con menos de 3 reseñas ("Sin datos suficientes", H21).',
    })
    calificacion!: number | null;

    @ApiProperty({ example: 7, description: 'Reseñas del rango que calificaron al entrenador.' })
    resenas!: number;
}

/** Respuesta de GET /reportes/desempeno (BE-29.1). */
export class ReporteDesempenoResponseDto {
    @ApiProperty({ example: '2026-10-22' })
    desde!: string;

    @ApiProperty({ example: '2026-11-20' })
    hasta!: string;

    @ApiProperty({ type: FilaDesempenoDto, isArray: true, description: 'Un entrenador por fila, por nombre.' })
    filas!: FilaDesempenoDto[];
}
