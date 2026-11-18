import { ApiProperty } from '@nestjs/swagger';
import type { BloqueDisponibilidad } from '@PrismaClient';

/**
 * Bloque libre visto por un miembro. No incluye estado ni datos de otros
 * miembros: todos los que se devuelven están DISPONIBLES.
 */
export class BloqueLibreDto {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty({ type: String, format: 'date-time' })
    inicio!: Date;

    @ApiProperty({ type: String, format: 'date-time' })
    fin!: Date;

    @ApiProperty({ enum: [45, 60, 90], example: 60 })
    duracionMin!: number;

    static fromEntity(bloque: BloqueDisponibilidad): BloqueLibreDto {
        return {
            id: bloque.id,
            inicio: bloque.inicio,
            fin: bloque.fin,
            duracionMin: bloque.duracionMin,
        };
    }
}

/** Respuesta de GET /entrenadores/:id/bloques. */
export class BloquesEntrenadorResponseDto {
    @ApiProperty({ type: BloqueLibreDto, isArray: true })
    bloques!: BloqueLibreDto[];

    @ApiProperty({
        example: '10.00',
        description: 'Precio vigente de la clase puntual, con 2 decimales.',
    })
    precioClasePuntual!: string;
}