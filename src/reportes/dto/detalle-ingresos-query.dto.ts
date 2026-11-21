import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, ValidateBy } from 'class-validator';
import { ConceptoCobro } from '@PrismaClient';
import { RangoReporteQueryDto } from './rango-reporte-query.dto.js';

/** BE-27.2: mismas fechas inclusivas/defaults de H26; concepto obligatorio. */
export class DetalleIngresosQueryDto extends RangoReporteQueryDto {
    @ApiProperty({ enum: ConceptoCobro })
    @IsEnum(ConceptoCobro, { message: 'El concepto debe ser MEMBRESIA, RENOVACION o SESION_ADICIONAL.' })
    concepto!: ConceptoCobro;

    @ApiPropertyOptional({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER, default: 1, description: 'Página de 20 pagos.' })
    @IsOptional()
    @Transform(({ value }: { value: unknown }) => typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value)
    @ValidateBy({ name: 'paginaIngresosValida', validator: {
        validate: (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 1,
    } }, { message: 'La página debe ser un número entero positivo representable con precisión.' })
    pagina?: number;
}
