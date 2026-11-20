import { ApiProperty } from '@nestjs/swagger';
import { EstadoMaquina } from '@PrismaClient';
import type { CambioConUsuario } from '../repositories/maquina.repository.js';
import { UsuarioCambioMaquinaDto } from './maquina-response.dto.js';

// Un cambio de estado del historial de una máquina (H18).
export class HistorialMaquinaResponseDto {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty({ enum: EstadoMaquina, example: EstadoMaquina.OPERATIVA })
    estadoAnterior!: EstadoMaquina;

    @ApiProperty({ enum: EstadoMaquina, example: EstadoMaquina.EN_MANTENIMIENTO })
    estadoNuevo!: EstadoMaquina;

    @ApiProperty({ example: 'Banda desgastada, se espera el repuesto del proveedor.' })
    motivo!: string;

    @ApiProperty({
        type: String,
        format: 'date',
        nullable: true,
        example: '2026-12-01',
        description: 'La que se estimó en ese cambio; null si no se indicó o si volvió a estar operativa.',
    })
    fechaEstimadaRetorno!: string | null;

    @ApiProperty({ type: UsuarioCambioMaquinaDto })
    usuario!: UsuarioCambioMaquinaDto;

    @ApiProperty({ format: 'date-time', example: '2026-11-18T15:20:13.440Z' })
    cambiadoEn!: string;

    static fromEntity(cambio: CambioConUsuario): HistorialMaquinaResponseDto {
        return {
            id: cambio.id,
            estadoAnterior: cambio.estadoAnterior,
            estadoNuevo: cambio.estadoNuevo,
            motivo: cambio.motivo,
            fechaEstimadaRetorno: cambio.fechaEstimadaRetorno
                ? cambio.fechaEstimadaRetorno.toISOString().slice(0, 10)
                : null,
            usuario: cambio.cambiadoPor,
            cambiadoEn: cambio.cambiadoEn.toISOString(),
        };
    }
}
