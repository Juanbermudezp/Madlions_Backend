import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ValidateBy } from 'class-validator';
import { hoyLocal } from '@Common/fechas';
import { esNumeroTarjetaValido, esVencimientoValido } from '../services/reglas-pago.js';

export const TITULAR_INVALIDO = 'El titular debe tener entre 2 y 100 letras.';
export const NUMERO_TARJETA_INVALIDO = 'El número de tarjeta no es válido.';
export const VENCIMIENTO_INVALIDO = 'El vencimiento debe tener el formato MM/AA y no estar vencido.';
export const CVV_INVALIDO = 'El código de seguridad debe tener 3 o 4 dígitos.';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Un solo decorador por campo, para devolver un único mensaje (convención del equipo). */
const regla = (nombre: string, validar: (valor: unknown) => boolean, mensaje: string) =>
    ValidateBy({ name: nombre, validator: { validate: validar } }, { message: mensaje });

/**
 * Cuerpo de POST /cobros/:id/pagar (H12). Estos datos solo se usan para la
 * pasarela simulada: nunca se guardan ni se registran en logs, y los mensajes
 * de error no repiten lo que se envió.
 */
export class PagarCobroDto {
    @ApiProperty({ example: 'María López' })
    @Transform(trim)
    @regla('titularValido', (v) => typeof v === 'string' && /^[\p{L} .'-]{2,100}$/u.test(v), TITULAR_INVALIDO)
    titular!: string;

    @ApiProperty({ example: '4242 4242 4242 4242', description: '4242 aprueba, 0002 rechaza, 0119 da error.' })
    @Transform(trim)
    @regla('numeroTarjetaValido', esNumeroTarjetaValido, NUMERO_TARJETA_INVALIDO)
    numero!: string;

    @ApiProperty({ example: '12/28', description: 'MM/AA' })
    @Transform(trim)
    @regla('vencimientoValido', (v) => esVencimientoValido(v, hoyLocal()), VENCIMIENTO_INVALIDO)
    vencimiento!: string;

    @ApiProperty({ example: '123' })
    @Transform(trim)
    @regla('cvvValido', (v) => typeof v === 'string' && /^\d{3,4}$/.test(v), CVV_INVALIDO)
    cvv!: string;
}
