import { ApiProperty } from '@nestjs/swagger';
import { TipoActividad } from './crear-resena.dto.js';
import type { PendientePorCalificar } from '../repositories/resena.repository.js';
import { fechaLimite } from '../services/reglas-resena.js';

// Clase o sesión que el miembro todavía puede calificar (H20).
export class PendienteResenaDto {
    @ApiProperty({ enum: TipoActividad, example: TipoActividad.CLASE })
    tipo!: TipoActividad;

    @ApiProperty({
        format: 'uuid',
        description: 'Id de la reserva (CLASE) o de la sesión personal (SESION).',
    })
    registroId!: string;

    @ApiProperty({ example: 'Spinning' })
    nombre!: string;

    @ApiProperty({ example: 'Carlos Martínez' })
    entrenador!: string;

    @ApiProperty({ format: 'date-time' })
    fin!: string;

    @ApiProperty({ format: 'date-time', description: 'Fin más 7 días.' })
    fechaLimite!: string;

    static fromEntity(pendiente: PendientePorCalificar): PendienteResenaDto {
        return {
            tipo: pendiente.tipo,
            registroId: pendiente.registroId,
            nombre: pendiente.nombre,
            entrenador: pendiente.entrenador,
            fin: pendiente.fin.toISOString(),
            fechaLimite: fechaLimite(pendiente.fin).toISOString(),
        };
    }
}
