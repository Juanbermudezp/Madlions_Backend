import { ApiProperty } from '@nestjs/swagger';
import type { Clase, TipoClase } from '@PrismaClient';

export class ClaseResponseDto {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty({ example: 'Spinning' })
    nombre!: string;

    @ApiProperty({ type: String, format: 'date-time' })
    inicio!: Date;

    @ApiProperty({ type: String, format: 'date-time' })
    fin!: Date;

    /** `nombre` es el nombre del tipo de clase (la pantalla de H8 lo usa así). */
    static fromEntity(clase: Clase & { tipoClase: TipoClase }): ClaseResponseDto {
        return {
            id: clase.id,
            nombre: clase.tipoClase.nombre,
            inicio: clase.inicio,
            fin: clase.fin,
        };
    }
}