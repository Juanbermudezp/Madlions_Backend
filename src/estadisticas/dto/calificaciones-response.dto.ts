import { ApiProperty } from '@nestjs/swagger';

// Promedio de un entrenador o de un tipo de clase (H21).
export class PromedioCalificacionDto {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty({ example: 'Carlos Martínez' })
    nombre!: string;

    @ApiProperty({
        type: Number,
        nullable: true,
        example: 4.5,
        description: 'Con un decimal. Null con menos de 3 reseñas: "Sin datos suficientes".',
    })
    promedio!: number | null;

    @ApiProperty({ example: 8, description: 'Reseñas que calificaron este aspecto en el rango.' })
    total!: number;
}

// Promedio de las instalaciones, que no se desglosa (H21).
export class PromedioInstalacionesDto {
    @ApiProperty({ type: Number, nullable: true, example: 4.2 })
    promedio!: number | null;

    @ApiProperty({ example: 12 })
    total!: number;
}

// Respuesta de GET /estadisticas/calificaciones (H21).
export class CalificacionesResponseDto {
    @ApiProperty({ example: '2026-10-22', description: 'Primer día del rango (hora de El Salvador).' })
    desde!: string;

    @ApiProperty({ example: '2026-11-20', description: 'Último día del rango.' })
    hasta!: string;

    @ApiProperty({ type: PromedioCalificacionDto, isArray: true })
    entrenadores!: PromedioCalificacionDto[];

    @ApiProperty({ type: PromedioCalificacionDto, isArray: true })
    tiposClase!: PromedioCalificacionDto[];

    @ApiProperty({ type: PromedioInstalacionesDto })
    instalaciones!: PromedioInstalacionesDto;
}
