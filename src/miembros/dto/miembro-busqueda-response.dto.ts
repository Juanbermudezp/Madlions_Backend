import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    ESTADOS_MEMBRESIA_MIEMBRO,
    type EstadoMembresiaMiembro,
} from '@Membresias/services';

/**
 * Resultado de GET /miembros/buscar. Para ENTRENADOR se omiten documento,
 * estadoMembresia y fechaVencimiento.
 */
export class MiembroBusquedaResponseDto {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty({ example: 'María' })
    nombre!: string;

    @ApiProperty({ example: 'López' })
    apellido!: string;

    @ApiProperty({ example: 'MBR-000001' })
    codigo!: string;

    @ApiPropertyOptional({ example: '01234567-8', description: 'No se incluye para ENTRENADOR.' })
    documento?: string;

    @ApiPropertyOptional({ enum: ESTADOS_MEMBRESIA_MIEMBRO, description: 'No se incluye para ENTRENADOR.' })
    estadoMembresia?: EstadoMembresiaMiembro;

    @ApiPropertyOptional({
        type: String,
        nullable: true,
        example: '2026-12-19',
        description: 'AAAA-MM-DD. No se incluye para ENTRENADOR.',
    })
    fechaVencimiento?: string | null;
}
