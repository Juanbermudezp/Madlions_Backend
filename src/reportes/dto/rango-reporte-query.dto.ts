import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

/**
 * Query `?desde=AAAA-MM-DD&hasta=AAAA-MM-DD` de los reportes (H26 a H29).
 * Ambos días se incluyen. Sin fechas: los últimos 30 días. Máximo 12 meses.
 */
export class RangoReporteQueryDto {
    @ApiPropertyOptional({ example: '2026-10-20', description: 'Primer día del rango (hora de El Salvador).' })
    @IsOptional()
    @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha de inicio debe tener el formato AAAA-MM-DD.' })
    desde?: string;

    @ApiPropertyOptional({ example: '2026-11-18', description: 'Último día del rango (hora de El Salvador).' })
    @IsOptional()
    @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha de fin debe tener el formato AAAA-MM-DD.' })
    hasta?: string;
}
