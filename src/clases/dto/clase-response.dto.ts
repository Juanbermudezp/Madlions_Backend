import { ApiProperty } from '@nestjs/swagger';
import type { Clase } from '@PrismaClient';

export class ClaseResponseDto {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty({ example: 'Spinning' })
    nombre!: string;

    @ApiProperty({ type: String, format: 'date-time' })
    inicio!: Date;

    @ApiProperty({ type: String, format: 'date-time' })
    fin!: Date;

    static fromEntity(clase: Clase): ClaseResponseDto {
        return {
            id: clase.id,
            nombre: clase.nombre,
            inicio: clase.inicio,
            fin: clase.fin,
        };
    }
}