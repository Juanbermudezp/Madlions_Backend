import { ApiProperty } from '@nestjs/swagger';
import type { User } from '@PrismaClient';

/** Entrenador en la lista de "Agendar sesión". Solo id y nombre: nada más del usuario. */
export class EntrenadorResumenDto {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty({ example: 'Carlos Martínez' })
    nombre!: string;

    static fromEntity(usuario: User): EntrenadorResumenDto {
        return { id: usuario.id, nombre: `${usuario.nombre} ${usuario.apellido}` };
    }
}