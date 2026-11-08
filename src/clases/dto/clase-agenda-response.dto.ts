import { ApiProperty } from '@nestjs/swagger';
import { EstadoClase } from '@PrismaClient';
import type { ClaseConRelaciones } from '../repositories/clase.repository.js';
import {
    ESTADO_IMPARTIDA,
    estadoVisible,
    type EstadoVisibleClase,
} from '../services/reglas-clase.js';

export class TipoClaseResumenDto {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty({ example: 'Yoga' })
    nombre!: string;
}

export class EntrenadorResumenDto {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty({ example: 'Carlos Martínez' })
    nombre!: string;
}

/** Clase tal como la ve la agenda semanal (H4). */
export class ClaseAgendaResponseDto {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty({ type: TipoClaseResumenDto })
    tipo!: TipoClaseResumenDto;

    @ApiProperty({ type: EntrenadorResumenDto })
    entrenador!: EntrenadorResumenDto;

    @ApiProperty({ type: String, nullable: true, example: 'Clase para principiantes' })
    descripcion!: string | null;

    @ApiProperty({ type: String, format: 'date-time' })
    inicio!: Date;

    @ApiProperty({ type: String, format: 'date-time' })
    fin!: Date;

    @ApiProperty({ example: 20 })
    cupoMaximo!: number;

    @ApiProperty({ example: 5 })
    reservasConfirmadas!: number;

    @ApiProperty({ example: 15 })
    lugaresDisponibles!: number;

    @ApiProperty({ enum: [...Object.values(EstadoClase), ESTADO_IMPARTIDA] })
    estado!: EstadoVisibleClase;

    static fromEntity(
        clase: ClaseConRelaciones,
        reservasConfirmadas: number,
        ahora: Date,
    ): ClaseAgendaResponseDto {
        return {
            id: clase.id,
            tipo: { id: clase.tipoClase.id, nombre: clase.tipoClase.nombre },
            entrenador: {
                id: clase.entrenador.id,
                nombre: `${clase.entrenador.nombre} ${clase.entrenador.apellido}`,
            },
            descripcion: clase.descripcion,
            inicio: clase.inicio,
            fin: clase.fin,
            cupoMaximo: clase.cupoMaximo,
            reservasConfirmadas,
            lugaresDisponibles: Math.max(clase.cupoMaximo - reservasConfirmadas, 0),
            estado: estadoVisible(clase, ahora),
        };
    }
}
