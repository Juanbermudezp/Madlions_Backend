import { ApiProperty } from '@nestjs/swagger';
import { AsistenciaSesion, EstadoCobro, EstadoSesion } from '@PrismaClient';
import type { SesionConDetalle } from '@Sesiones/repositories';

export class CobroSesionDto {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty({ enum: EstadoCobro })
    estado!: EstadoCobro;
}

/** Sesión en "Mis sesiones" (GET /sesiones/mias), con el estado de su cobro. */
export class SesionResponseDto {
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

    @ApiProperty({ enum: EstadoSesion })
    estado!: EstadoSesion;

    @ApiProperty({ enum: AsistenciaSesion })
    asistencia!: AsistenciaSesion;

    @ApiProperty({ type: CobroSesionDto, nullable: true })
    cobro!: CobroSesionDto | null;

    static fromEntity(sesion: SesionConDetalle): SesionResponseDto {
        return {
            id: sesion.id,
            inicio: sesion.inicio,
            fin: sesion.fin,
            entrenador: `${sesion.entrenador.nombre} ${sesion.entrenador.apellido}`,
            precio: sesion.precio.toFixed(2),
            estado: sesion.estado,
            asistencia: sesion.asistencia,
            cobro: sesion.cobro ? { id: sesion.cobro.id, estado: sesion.cobro.estado } : null,
        };
    }
}