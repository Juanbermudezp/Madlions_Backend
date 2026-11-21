import { ApiProperty } from '@nestjs/swagger';
import { isNumber, ValidateBy } from 'class-validator';

/** Mismo tope que el precio de los planes: lo que cabe en DECIMAL(10,2). */
export const PRECIO_CLASE_PUNTUAL_MAXIMO = 99_999_999.99;

export const PRECIO_CLASE_PUNTUAL_INVALIDO =
    'El precio debe ser mayor que 0 y tener como máximo 2 decimales.';

/** Número mayor que 0, con hasta 2 decimales y que cabe en DECIMAL(10,2). */
export function esPrecioValido(valor: unknown): boolean {
    return (
        isNumber(valor, { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false }) &&
        valor > 0 &&
        valor <= PRECIO_CLASE_PUNTUAL_MAXIMO
    );
}

/** Cuerpo de PUT /configuracion/precio-clase-puntual (H1, BE-1.2). */
export class UpdatePrecioClasePuntualDto {
    /**
     * Se valida con un solo decorador (y no con IsNumber + Min + Max) para que
     * un precio faltante o inválido devuelva un único mensaje, como en H4.
     */
    @ApiProperty({ example: 12.5, exclusiveMinimum: true, minimum: 0, maximum: PRECIO_CLASE_PUNTUAL_MAXIMO })
    @ValidateBy(
        { name: 'esPrecioValido', validator: { validate: esPrecioValido } },
        { message: PRECIO_CLASE_PUNTUAL_INVALIDO },
    )
    precio!: number;
}
