import { ApiProperty } from '@nestjs/swagger';
import type { Resena } from '@PrismaClient';
import { TipoActividad } from './crear-resena.dto.js';

// Reseña recién guardada (H20).
export class ResenaResponseDto {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty({ enum: TipoActividad, example: TipoActividad.CLASE })
    tipo!: TipoActividad;

    @ApiProperty({ format: 'uuid' })
    registroId!: string;

    @ApiProperty({ type: Number, nullable: true, example: 5 })
    calActividad!: number | null;

    @ApiProperty({ type: Number, nullable: true, example: 4 })
    calEntrenador!: number | null;

    @ApiProperty({ type: Number, nullable: true, example: null })
    calInstalaciones!: number | null;

    @ApiProperty({ type: String, nullable: true, example: 'La clase estuvo muy buena.' })
    comentario!: string | null;

    @ApiProperty({ format: 'date-time' })
    creadaEn!: string;

    static fromEntity(resena: Resena): ResenaResponseDto {
        return {
            id: resena.id,
            tipo: resena.reservaId ? TipoActividad.CLASE : TipoActividad.SESION,
            registroId: (resena.reservaId ?? resena.sesionId)!,
            calActividad: resena.calActividad,
            calEntrenador: resena.calEntrenador,
            calInstalaciones: resena.calInstalaciones,
            comentario: resena.comentario,
            creadaEn: resena.creadaEn.toISOString(),
        };
    }
}
