import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, Length, ValidateBy } from 'class-validator';
import { EstadoMaquina } from '@PrismaClient';
import { esFechaValida } from '@Common/fechas';
import { ESTADO_MAQUINA_INVALIDO } from './listar-maquinas-query.dto.js';

export const MOTIVO_INVALIDO =
    'El motivo es obligatorio y debe tener entre 5 y 250 caracteres.';
export const FECHA_RETORNO_FORMATO =
    'La fecha estimada de retorno debe tener el formato AAAA-MM-DD.';

const recortar = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value;

// El formulario manda la fecha vacía cuando no se eligió ninguna.
const vacioEsSinFecha = ({ value }: { value: unknown }) =>
    value === '' ? undefined : value;

// Cuerpo de POST /maquinas/:id/estado (H18).
export class CambiarEstadoMaquinaDto {
    @ApiProperty({ enum: EstadoMaquina, example: EstadoMaquina.EN_MANTENIMIENTO })
    @IsEnum(EstadoMaquina, { message: ESTADO_MAQUINA_INVALIDO })
    estado!: EstadoMaquina;

    @ApiProperty({
        minLength: 5,
        maxLength: 250,
        example: 'Banda desgastada, se espera el repuesto del proveedor.',
    })
    @Transform(recortar)
    @IsString({ message: MOTIVO_INVALIDO })
    @Length(5, 250, { message: MOTIVO_INVALIDO })
    motivo!: string;

    @ApiPropertyOptional({
        example: '2026-12-01',
        description:
            'AAAA-MM-DD, de hoy en adelante. No se envía al volver a OPERATIVA.',
    })
    @Transform(vacioEsSinFecha)
    @IsOptional()
    @ValidateBy(
        {
            name: 'esFechaValida',
            validator: { validate: (v: unknown) => typeof v === 'string' && esFechaValida(v) },
        },
        { message: FECHA_RETORNO_FORMATO },
    )
    fechaEstimadaRetorno?: string;
}
