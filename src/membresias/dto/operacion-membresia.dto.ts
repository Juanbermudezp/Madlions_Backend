import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, ValidateBy } from 'class-validator';
import { esFechaValida } from '@Common/fechas';

export const MIEMBRO_INVALIDO = 'El miembro no es válido.';
export const PLAN_INVALIDO = 'El plan no es válido.';
export const FECHA_INICIO_FORMATO = 'La fecha de inicio debe tener el formato AAAA-MM-DD.';

/**
 * Datos de una compra o renovación (H2). Es el query de
 * GET /membresias/resumen y el cuerpo de POST /membresias.
 */
export class OperacionMembresiaDto {
    @ApiProperty({ format: 'uuid' })
    @IsUUID('all', { message: MIEMBRO_INVALIDO })
    miembroId!: string;

    @ApiProperty({ format: 'uuid' })
    @IsUUID('all', { message: PLAN_INVALIDO })
    planId!: string;

    @ApiPropertyOptional({
        example: '2026-11-20',
        description:
            'AAAA-MM-DD, entre hoy y los próximos 30 días. Por defecto, hoy. ' +
            'En la renovación de una membresía vigente se ignora: empieza el día siguiente al vencimiento.',
    })
    @IsOptional()
    @ValidateBy(
        { name: 'esFechaValida', validator: { validate: (v: unknown) => typeof v === 'string' && esFechaValida(v) } },
        { message: FECHA_INICIO_FORMATO },
    )
    fechaInicio?: string;
}
