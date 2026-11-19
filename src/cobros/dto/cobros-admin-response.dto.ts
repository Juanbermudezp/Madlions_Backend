import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConceptoCobro } from '@PrismaClient';

class MiembroCobroDto {
    @ApiProperty({ example: 'María López' }) nombre!: string;
    @ApiProperty({ example: 'MBR-000002' }) codigo!: string;
}

/** Un cobro en la consulta administrativa (H13). Montos en USD, IVA incluido. */
export class CobroAdminDto {
    @ApiProperty({ format: 'uuid' }) id!: string;
    @ApiProperty({ type: MiembroCobroDto }) miembro!: MiembroCobroDto;
    @ApiProperty({ enum: ConceptoCobro }) concepto!: ConceptoCobro;
    @ApiProperty({ example: 'Mensual ilimitado', description: 'Plan, o fecha y entrenador de la sesión.' })
    detalle!: string;
    @ApiProperty({ example: 35.5 }) monto!: number;
    @ApiProperty({ example: '2026-11-15T22:30:00.000Z' }) creadoEn!: string;
    @ApiProperty({ description: 'true si está PENDIENTE y ya se puede pagar (hora de El Salvador). Una renovación anticipada sale false.' })
    habilitado!: boolean;
    @ApiProperty({ type: String, nullable: true, example: '2026-11-24', description: 'AAAA-MM-DD; null = desde que se generó.' })
    habilitadoDesde!: string | null;
    @ApiProperty({ type: String, nullable: true, example: '2026-11-16T15:00:00.000Z', description: 'null si está pendiente.' })
    pagadoEn!: string | null;
    @ApiPropertyOptional({ example: 'PAY-20261116-A1B2C3', description: 'Referencia del pago aprobado (solo los pagados).' })
    referencia?: string;
}

/** Respuesta de GET /cobros (H13). `total` y `sumaMontos` corresponden a los filtros aplicados, no solo a la página. */
export class CobrosAdminResponseDto {
    @ApiProperty({ type: CobroAdminDto, isArray: true }) items!: CobroAdminDto[];
    @ApiProperty({ example: 42, description: 'Cantidad de cobros con los filtros aplicados.' }) total!: number;
    @ApiProperty({ example: 1250.5, description: 'Suma de los montos con los filtros aplicados.' }) sumaMontos!: number;
    @ApiProperty({ example: 1 }) pagina!: number;
}