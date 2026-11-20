import { ApiProperty } from '@nestjs/swagger';
import { ConceptoCobro, TipoPlan } from '@PrismaClient';

export class IngresoPorConceptoDto {
    @ApiProperty({ enum: ConceptoCobro }) concepto!: ConceptoCobro;
    @ApiProperty({ example: 500 }) total!: number;
}

export class IngresoPorTipoPlanDto {
    @ApiProperty({ enum: TipoPlan, description: 'Tipo histórico de la membresía; no incluye sesiones adicionales.' }) tipoPlan!: TipoPlan;
    @ApiProperty({ example: 600 }) total!: number;
}

export class IngresoPorDiaDto {
    @ApiProperty({ format: 'date', example: '2026-11-18', description: 'Día calendario de El Salvador (UTC-6).' }) fecha!: string;
    @ApiProperty({ example: 1130 }) total!: number;
}

export class ComparacionIngresosDto {
    @ApiProperty({ example: 900, description: 'Total del período inmediatamente anterior, de igual cantidad de días.' }) total!: number;
    @ApiProperty({ example: 230, description: 'Total actual menos anterior; puede ser negativo.' }) diferencia!: number;
    @ApiProperty({ type: Number, nullable: true, example: 25.6, description: 'Variación con un decimal HALF_UP; null si el anterior es cero.' }) porcentaje!: number | null;
}

/** Importes JSON number: cálculo Decimal hasta esta representación final,
 * HALF_UP a dos decimales. El consumidor formatea los ceros (35 -> 35.00).
 */
export class ReporteIngresosResponseDto {
    @ApiProperty({ example: 1130 }) total!: number;
    @ApiProperty({ example: 1000, description: 'Total / 1.13; HALF_UP sobre el total agregado, no suma de subtotales individuales.' }) subtotal!: number;
    @ApiProperty({ example: 130, description: 'Total menos subtotal, IVA incluido del 13 %.' }) iva!: number;
    @ApiProperty({ type: [IngresoPorConceptoDto], description: 'Los tres conceptos, incluyendo ceros.' }) porConcepto!: IngresoPorConceptoDto[];
    @ApiProperty({ type: [IngresoPorTipoPlanDto], description: 'Los tres tipos históricos de plan, incluyendo ceros.' }) porTipoPlan!: IngresoPorTipoPlanDto[];
    @ApiProperty({ type: [IngresoPorDiaDto], description: 'Todos los días del rango inclusivo en orden ascendente, incluyendo ceros.' }) porDia!: IngresoPorDiaDto[];
    @ApiProperty({ type: ComparacionIngresosDto }) anterior!: ComparacionIngresosDto;
}

export class PagoIngresoDto {
    @ApiProperty({ example: 'Ana Martínez' }) miembro!: string;
    @ApiProperty({ example: 'MBR-000001' }) codigo!: string;
    @ApiProperty({ format: 'date', example: '2026-11-18', description: 'Día de pagadoEn en El Salvador.' }) fecha!: string;
    @ApiProperty({ example: 35 }) monto!: number;
    @ApiProperty({ example: 'PAY-20261118-ABC123', description: 'Referencia del intento APROBADO vinculado al comprobante del cobro.' }) referencia!: string;
}

export class DetalleIngresosResponseDto {
    @ApiProperty({ type: [PagoIngresoDto], description: 'Hasta 20 pagos; puede estar vacío en una página fuera de rango.' }) items!: PagoIngresoDto[];
    @ApiProperty({ example: 25, description: 'Cantidad total de pagos filtrados, no tamaño de página.' }) total!: number;
    @ApiProperty({ example: 1 }) pagina!: number;
}
