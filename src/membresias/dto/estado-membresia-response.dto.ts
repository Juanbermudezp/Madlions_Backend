import { ApiProperty } from '@nestjs/swagger';
import { TipoPlan } from '@PrismaClient';
import { ESTADOS_MEMBRESIA_MIEMBRO, type EstadoMembresiaMiembro } from '../services/reglas-estado.js';

class RenovacionDto {
    @ApiProperty({ enum: ['PENDIENTE_PAGO', 'POR_INICIAR'] })
    estado!: 'PENDIENTE_PAGO' | 'POR_INICIAR';

    @ApiProperty({ example: '2026-12-15', description: 'AAAA-MM-DD' })
    fechaInicio!: string;
}

/**
 * Respuesta de GET /membresias/mia: el objeto de BE-2.4. Con SIN_MEMBRESIA,
 * todos los demás campos son null.
 */
export class EstadoMembresiaResponseDto {
    @ApiProperty({ enum: ESTADOS_MEMBRESIA_MIEMBRO }) estado!: EstadoMembresiaMiembro;
    @ApiProperty({ type: String, format: 'uuid', nullable: true }) membresiaId!: string | null;
    @ApiProperty({ type: String, nullable: true, example: 'Mensual ilimitado' }) plan!: string | null;
    @ApiProperty({ enum: TipoPlan, nullable: true }) tipoPlan!: TipoPlan | null;
    @ApiProperty({ type: String, nullable: true, example: '2026-11-15' }) fechaInicio!: string | null;
    @ApiProperty({ type: String, nullable: true, example: '2026-12-14' }) fechaVencimiento!: string | null;
    @ApiProperty({ type: Number, nullable: true, example: 29, description: '0 = vence hoy. Solo en VIGENTE y PROXIMA_A_VENCER.' })
    diasRestantes!: number | null;
    @ApiProperty({ type: Number, nullable: true, example: 8 }) creditosTotales!: number | null;
    @ApiProperty({ type: Number, nullable: true, example: 5 }) creditosDisponibles!: number | null;
    @ApiProperty({ type: String, format: 'uuid', isArray: true, nullable: true }) tiposClaseIds!: string[] | null;
    @ApiProperty({ type: RenovacionDto, nullable: true }) renovacion!: RenovacionDto | null;
}
