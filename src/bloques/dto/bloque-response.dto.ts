import { ApiProperty } from '@nestjs/swagger';
import { EstadoBloque, type BloqueDisponibilidad } from '@PrismaClient';

type BloqueConSesionOpcional = BloqueDisponibilidad & {
    sesion?: { miembro: { usuario: { nombre: string; apellido: string } } } | null;
};

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

    @ApiProperty({ type: MiembroResumenDto, nullable: true, description: 'Miembro que agendó la sesión (solo si está OCUPADO).' })
    miembro!: MiembroResumenDto | null;

    /**
     * `miembro` es quien agendó la sesión (H9); null si el bloque está
     * DISPONIBLE o si no se cargó la sesión (por ejemplo, al crearlo).
     */
    static fromEntity(bloque: BloqueConSesionOpcional): BloqueResponseDto {
        const usuario = bloque.sesion?.miembro.usuario;
        return {
            id: bloque.id,
            inicio: bloque.inicio,
            fin: bloque.fin,
            duracionMin: bloque.duracionMin,
            estado: bloque.estado,
            miembro: usuario ? { nombre: `${usuario.nombre} ${usuario.apellido}` } : null,
        };
    }
}