import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ResultadoPago } from '@PrismaClient';

/**
 * Respuesta 200 de POST /cobros/:id/pagar. Aprobado: referencia y número de
 * comprobante. Rechazado o error: el mensaje de la pasarela (el cobro sigue
 * PENDIENTE y se puede intentar de nuevo).
 */
export class PagoResponseDto {
    @ApiProperty({ enum: ResultadoPago }) resultado!: ResultadoPago;
    @ApiPropertyOptional({ example: 'PAY-20261115-A1B2C3' }) referencia?: string;
    @ApiPropertyOptional({ example: 'CMP-000001' }) comprobanteNumero?: string;
    @ApiPropertyOptional({ example: 'Tu banco rechazó el pago. Verifica los datos o usa otra tarjeta.' }) mensaje?: string;
}
