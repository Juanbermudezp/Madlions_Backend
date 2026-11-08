import { ApiProperty } from '@nestjs/swagger';
import { EstadoBloque, type BloqueDisponibilidad } from '@PrismaClient';

export class MiembroResumenDto {
    @ApiProperty({ example: 'María López' })
    nombre!: string;
}

export class BloqueResponseDto {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty({ type: String, format: 'date-time' })
    inicio!: Date;

    @ApiProperty({ type: String, format: 'date-time' })
    fin!: Date;

    @ApiProperty({ enum: [45, 60, 90], example: 60 })
    duracionMin!: number;

    @ApiProperty({ enum: EstadoBloque })
    estado!: EstadoBloque;

    @ApiProperty({ type: MiembroResumenDto, nullable: true })
    miembro!: MiembroResumenDto | null;

    static fromEntity(bloque: BloqueDisponibilidad): BloqueResponseDto {
        return {
            id: bloque.id,
            inicio: bloque.inicio,
            fin: bloque.fin,
            duracionMin: bloque.duracionMin,
            estado: bloque.estado,
            miembro: null,
        };
    }
}