import { ApiProperty } from '@nestjs/swagger';
import { AsistenciaReserva } from '@PrismaClient';
import { TipoActividad } from './marcar-asistencia.dto.js';
import type { ActividadConMiembros } from '../repositories/asistencia.repository.js';

// Un miembro dentro de una actividad por registrar (H19).
export class MiembroActividadDto {
    @ApiProperty({
        format: 'uuid',
        description: 'Id de la reserva o de la sesión: es lo que se manda al marcar.',
    })
    registroId!: string;

    @ApiProperty({ example: 'María López' })
    nombre!: string;

    @ApiProperty({ example: 'MBR-000002' })
    codigo!: string;

    @ApiProperty({ enum: AsistenciaReserva, example: AsistenciaReserva.SIN_REGISTRAR })
    asistencia!: AsistenciaReserva;
}

// Clase o sesión del entrenador dentro de la ventana de registro (H19).
export class ActividadPendienteDto {
    @ApiProperty({ enum: TipoActividad, example: TipoActividad.CLASE })
    tipo!: TipoActividad;

    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty({ example: 'Spinning' })
    nombre!: string;

    @ApiProperty({ format: 'date-time' })
    inicio!: string;

    @ApiProperty({ format: 'date-time' })
    fin!: string;

    @ApiProperty({ type: MiembroActividadDto, isArray: true })
    miembros!: MiembroActividadDto[];

    static fromEntity(actividad: ActividadConMiembros): ActividadPendienteDto {
        return {
            tipo: actividad.tipo,
            id: actividad.id,
            nombre: actividad.nombre,
            inicio: actividad.inicio.toISOString(),
            fin: actividad.fin.toISOString(),
            miembros: actividad.miembros,
        };
    }
}
