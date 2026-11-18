import { ApiProperty } from '@nestjs/swagger';
import type { SesionPersonal } from '@PrismaClient';

/** Respuesta 201 de POST /sesiones. */
export class SesionAgendadaResponseDto {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty({ type: String, format: 'date-time' })
    inicio!: Date;

    @ApiProperty({ type: String, format: 'date-time' })
    fin!: Date;

    @ApiProperty({ example: 'Carlos Martínez' })
    entrenador!: string;

    @ApiProperty({ example: '10.00' })
    precio!: string;

    @ApiProperty({ format: 'uuid' })
    cobroId!: string;

    static from(sesion: SesionPersonal, entrenador: string): SesionAgendadaResponseDto {
        return {
            id: sesion.id,
            inicio: sesion.inicio,
            fin: sesion.fin,
            entrenador,
            precio: sesion.precio.toFixed(2),
            cobroId: sesion.cobroId!,
        };
    }
}