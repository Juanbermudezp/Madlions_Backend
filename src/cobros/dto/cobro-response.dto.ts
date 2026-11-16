import { ApiProperty } from '@nestjs/swagger';
import { ConceptoCobro, EstadoCobro } from '@PrismaClient';

/** Un cobro del miembro autenticado (GET /cobros/mios). */
export class CobroResponseDto {
    @ApiProperty({ format: 'uuid' }) id!: string;
    @ApiProperty({ enum: ConceptoCobro }) concepto!: ConceptoCobro;
    @ApiProperty({ example: 'Mensual ilimitado', description: 'Plan, o fecha y entrenador de la sesión.' })
    detalle!: string;
    @ApiProperty({ example: 35.5, description: 'USD, IVA incluido.' }) monto!: number;
    @ApiProperty({ enum: EstadoCobro }) estado!: EstadoCobro;
    @ApiProperty({ description: 'true si está PENDIENTE y ya se puede pagar (hora de El Salvador).' })
    habilitado!: boolean;
    @ApiProperty({ type: String, nullable: true, example: '2026-11-24', description: 'AAAA-MM-DD; null = desde que se generó.' })
    habilitadoDesde!: string | null;
    @ApiProperty({ type: String, nullable: true, example: 'CMP-000001' }) comprobanteNumero!: string | null;
}
