import { ApiProperty } from '@nestjs/swagger';
import { EstadoMaquina, TipoMaquina, ZonaMaquina } from '@PrismaClient';
import type { MaquinaConUltimoCambio } from '../repositories/maquina.repository.js';

/** Fecha de una columna DATE como AAAA-MM-DD. */
function fechaISO(fecha: Date | null): string | null {
    return fecha ? fecha.toISOString().slice(0, 10) : null;
}

/**
 * Campos que ve cualquier rol. Se arma como objeto plano (sin anotar la clase)
 * para que MaquinaInternaResponseDto pueda esparcirlo sin arrastrar prototipos.
 */
function camposPublicos(maquina: MaquinaConUltimoCambio) {
    return {
        id: maquina.id,
        codigo: maquina.codigo,
        nombre: maquina.nombre,
        tipo: maquina.tipo,
        zona: maquina.zona,
        estado: maquina.estado,
        fechaEstimadaRetorno: fechaISO(maquina.fechaEstimadaRetorno),
    };
}

/** Quién hizo el último cambio de estado. Dato interno (H17, criterio 5). */
export class UsuarioCambioMaquinaDto {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty({ example: 'Alberto' })
    nombre!: string;

    @ApiProperty({ example: 'Ramírez' })
    apellido!: string;
}

/**
 * Máquina tal como la ve cualquier rol (H17).
 *
 * No lleva `ultimoMotivo` ni `ultimoCambioPor`: el miembro no debe ver el
 * motivo interno ni quién hizo el último cambio. Los campos no se omiten en el
 * frontend, se construye otro objeto acá (criterio técnico de BE-17.1).
 */
export class MaquinaResponseDto {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty({ example: 'MAQ-001' })
    codigo!: string;

    @ApiProperty({ example: 'Caminadora 1' })
    nombre!: string;

    @ApiProperty({ enum: TipoMaquina, example: TipoMaquina.CARDIO })
    tipo!: TipoMaquina;

    @ApiProperty({ enum: ZonaMaquina, example: ZonaMaquina.PISO_1 })
    zona!: ZonaMaquina;

    @ApiProperty({ enum: EstadoMaquina, example: EstadoMaquina.OPERATIVA })
    estado!: EstadoMaquina;

    @ApiProperty({
        type: String,
        format: 'date',
        nullable: true,
        example: null,
        description: 'Solo en las máquinas que no están operativas; null si no se estimó una fecha.',
    })
    fechaEstimadaRetorno!: string | null;

    static fromEntity(maquina: MaquinaConUltimoCambio): MaquinaResponseDto {
        return camposPublicos(maquina);
    }
}

/**
 * Máquina con los datos internos del último cambio de estado. Solo la reciben
 * el administrador y el entrenador, que son quienes pueden cambiarlo (H18,
 * supuesto S13).
 */
export class MaquinaInternaResponseDto extends MaquinaResponseDto {
    @ApiProperty({
        type: String,
        nullable: true,
        example: 'Banda desgastada, se espera repuesto.',
        description: 'Motivo del último cambio de estado; null si nunca cambió.',
    })
    ultimoMotivo!: string | null;

    @ApiProperty({ type: UsuarioCambioMaquinaDto, nullable: true })
    ultimoCambioPor!: UsuarioCambioMaquinaDto | null;

    static override fromEntity(maquina: MaquinaConUltimoCambio): MaquinaInternaResponseDto {
        return {
            ...camposPublicos(maquina),
            ultimoMotivo: maquina.ultimoMotivo,
            ultimoCambioPor: maquina.ultimoCambioPor,
        };
    }
}
