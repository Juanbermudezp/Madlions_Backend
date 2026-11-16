import { ApiProperty } from '@nestjs/swagger';
import { ConceptoCobro } from '@PrismaClient';

class MiembroComprobanteDto {
    @ApiProperty({ example: 'María López' }) nombre!: string;
    @ApiProperty({ example: 'MBR-000002' }) codigo!: string;
}

/** Respuesta de GET /comprobantes/:numero (H12, BE-12.4). Montos en USD. */
export class ComprobanteResponseDto {
    @ApiProperty({ example: 'CMP-000001' }) numero!: string;
    @ApiProperty({ example: '2026-11-15T22:30:00.000Z' }) emitidoEn!: string;
    @ApiProperty({ type: MiembroComprobanteDto }) miembro!: MiembroComprobanteDto;
    @ApiProperty({ enum: ConceptoCobro }) concepto!: ConceptoCobro;
    @ApiProperty({ example: 'Mensual ilimitado' }) detalle!: string;
    @ApiProperty({ example: 31.42 }) subtotal!: number;
    @ApiProperty({ example: 4.08, description: 'IVA 13 %.' }) iva!: number;
    @ApiProperty({ example: 35.5 }) total!: number;
    @ApiProperty({ example: 'PAY-20261115-A1B2C3', description: 'Número de transacción.' }) referencia!: string;
    @ApiProperty({ example: '4242', description: 'Últimos 4 dígitos de la tarjeta.' }) ultimos4!: string;
}
