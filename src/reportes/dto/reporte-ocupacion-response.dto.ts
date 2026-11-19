import { ApiProperty } from '@nestjs/swagger';

class ResumenDto {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty({ example: 'Yoga' })
    nombre!: string;
}

export class FilaOcupacionDto {
    @ApiProperty({ type: ResumenDto })
    tipoClase!: ResumenDto;

    @ApiProperty({ type: ResumenDto })
    entrenador!: ResumenDto;

    @ApiProperty({ example: 4, description: 'Clases impartidas (PROGRAMADA con hora de fin pasada).' })
    vecesImpartida!: number;

    @ApiProperty({ example: 30, description: 'Reservas CONFIRMADA de esas clases.' })
    reservasConfirmadas!: number;

    @ApiProperty({ example: 48, description: 'Suma del cupo máximo de esas clases.' })
    cupoTotal!: number;

    @ApiProperty({ example: 62.5, description: 'reservasConfirmadas ÷ cupoTotal × 100, con un decimal.' })
    ocupacion!: number;

    @ApiProperty({ enum: ['BAJA', 'ALTA'], nullable: true, description: 'BAJA < 30 %, ALTA ≥ 90 %.' })
    etiqueta!: 'BAJA' | 'ALTA' | null;
}

/** Respuesta de GET /reportes/ocupacion (BE-26.1). */
export class ReporteOcupacionResponseDto {
    @ApiProperty({ example: '2026-10-20' })
    desde!: string;

    @ApiProperty({ example: '2026-11-18' })
    hasta!: string;

    @ApiProperty({ type: FilaOcupacionDto, isArray: true, description: 'De mayor a menor ocupación.' })
    filas!: FilaOcupacionDto[];
}
