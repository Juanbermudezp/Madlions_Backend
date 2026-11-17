import { randomInt } from 'node:crypto';
import { ResultadoPago } from '@PrismaClient';

/**
 * Reglas de la pasarela simulada y del pago (H12). Funciones puras: no
 * guardan ni registran los datos de la tarjeta.
 */

export const MENSAJES_PASARELA: Record<ResultadoPago, string> = {
    APROBADO: 'Pago aprobado.',
    RECHAZADO: 'Tu banco rechazó el pago. Verifica los datos o usa otra tarjeta.',
    ERROR: 'La pasarela no pudo procesar el pago. Intenta de nuevo.',
};

/** Solo dígitos (quita espacios y guiones que el usuario haya escrito). */
export function soloDigitos(numero: string): string {
    return numero.replace(/[\s-]/g, '');
}

/** Algoritmo de Luhn: detecta números de tarjeta mal escritos. */
export function pasaLuhn(numero: string): boolean {
    let suma = 0;
    for (let i = 0; i < numero.length; i++) {
        let digito = Number(numero[numero.length - 1 - i]);
        if (i % 2 === 1) {
            digito *= 2;
            if (digito > 9) digito -= 9;
        }
        suma += digito;
    }
    return suma % 10 === 0;
}

/** Número de 13 a 19 dígitos que pasa Luhn (admite espacios y guiones). */
export function esNumeroTarjetaValido(valor: unknown): boolean {
    if (typeof valor !== 'string') return false;
    const numero = soloDigitos(valor);
    return /^\d{13,19}$/.test(numero) && pasaLuhn(numero);
}

/**
 * Vencimiento "MM/AA" que no ha pasado: la tarjeta sirve hasta el último día
 * de ese mes. `hoy` en AAAA-MM-DD (hora de El Salvador).
 */
export function esVencimientoValido(valor: unknown, hoy: string): boolean {
    if (typeof valor !== 'string') return false;
    const coincide = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(valor.trim());
    if (!coincide) return false;
    const vence = `20${coincide[2]}-${coincide[1]}`;
    return vence >= hoy.slice(0, 7);
}

/** Reglas de la pasarela simulada según los últimos 4 dígitos. */
export function resultadoPorTarjeta(numero: string): ResultadoPago {
    const ultimos4 = soloDigitos(numero).slice(-4);
    if (ultimos4 === '4242') return ResultadoPago.APROBADO;
    if (ultimos4 === '0119') return ResultadoPago.ERROR;
    // 0002 y cualquier otra tarjeta válida: rechazada.
    return ResultadoPago.RECHAZADO;
}

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** Referencia única del intento: PAY-AAAAMMDD-XXXXXX (fecha de El Salvador). */
export function generarReferencia(hoy: string, aleatorio: (max: number) => number = randomInt): string {
    const sufijo = Array.from({ length: 6 }, () => ALFABETO[aleatorio(ALFABETO.length)]).join('');
    return `PAY-${hoy.replaceAll('-', '')}-${sufijo}`;
}

/** Tasa del IVA en El Salvador (13 %). */
export const TASA_IVA = 0.13;

/**
 * Desglose de un monto con IVA incluido (H12, BE-12.4):
 * - subtotal = total / 1.13, redondeado half-up a dos decimales;
 * - IVA = total − subtotal, así subtotal + IVA siempre suma el total.
 *
 * Se calcula con enteros (centavos) para no arrastrar errores de los
 * decimales de JavaScript: subtotal en centavos = ⌊(centavos × 100 + 56,5) / 113⌋,
 * que es dividir entre 1,13 y redondear la mitad hacia arriba.
 */
export function desglosarIva(totalConIva: number | string): { subtotal: number; iva: number; total: number } {
    const centavos = aCentavos(totalConIva);
    // round_half_up(c × 100 / 113) = ⌊(2 × c × 100 + 113) / 226⌋, todo con enteros.
    const subtotal = Math.floor((2 * centavos * 100 + 113) / 226);
    return { subtotal: subtotal / 100, iva: (centavos - subtotal) / 100, total: centavos / 100 };
}

/** "35.5" o 35.5 → 3550 centavos (el monto ya viene con dos decimales como máximo). */
function aCentavos(monto: number | string): number {
    const [enteros, decimales = ''] = String(monto).split('.');
    return Number(enteros) * 100 + Number(decimales.padEnd(2, '0').slice(0, 2));
}
