import { ResultadoPago } from '@PrismaClient';
import {
    desglosarIva,
    esNumeroTarjetaValido,
    esVencimientoValido,
    generarReferencia,
    pasaLuhn,
    resultadoPorTarjeta,
} from './reglas-pago.js';

describe('resultadoPorTarjeta · las cuatro reglas de la pasarela simulada', () => {
    it('regla 1: terminada en 4242 → APROBADO', () => {
        expect(resultadoPorTarjeta('4242424242424242')).toBe(ResultadoPago.APROBADO);
        expect(resultadoPorTarjeta('4242 4242 4242 4242')).toBe(ResultadoPago.APROBADO);
    });

    it('regla 2: terminada en 0002 → RECHAZADO', () => {
        expect(resultadoPorTarjeta('4000000000000002')).toBe(ResultadoPago.RECHAZADO);
    });

    it('regla 3: terminada en 0119 → ERROR', () => {
        expect(resultadoPorTarjeta('4000000000000119')).toBe(ResultadoPago.ERROR);
    });

    it('regla 4: cualquier otra tarjeta válida → RECHAZADO', () => {
        expect(resultadoPorTarjeta('5555555555554444')).toBe(ResultadoPago.RECHAZADO);
        expect(resultadoPorTarjeta('378282246310005')).toBe(ResultadoPago.RECHAZADO);
    });

    it('decide solo por los últimos 4 dígitos (no por el inicio)', () => {
        expect(resultadoPorTarjeta('5105105105104242')).toBe(ResultadoPago.APROBADO);
    });
});

describe('número de tarjeta', () => {
    it('las tarjetas de prueba pasan Luhn', () => {
        for (const n of ['4242424242424242', '4000000000000002', '4000000000000119']) expect(pasaLuhn(n)).toBe(true);
    });

    it('acepta 13 a 19 dígitos con espacios o guiones', () => {
        expect(esNumeroTarjetaValido('4242 4242 4242 4242')).toBe(true);
        expect(esNumeroTarjetaValido('4242-4242-4242-4242')).toBe(true);
    });

    it('rechaza un dígito mal escrito, letras, muy corto o muy largo', () => {
        expect(esNumeroTarjetaValido('4242424242424241')).toBe(false);
        expect(esNumeroTarjetaValido('4242abcd42424242')).toBe(false);
        expect(esNumeroTarjetaValido('424242424242')).toBe(false);
        expect(esNumeroTarjetaValido('42424242424242424242')).toBe(false);
        expect(esNumeroTarjetaValido(4242424242424242)).toBe(false);
    });
});

describe('vencimiento MM/AA', () => {
    const HOY = '2026-11-15';
    it('sirve hasta el último día del mes de vencimiento', () => {
        expect(esVencimientoValido('11/26', HOY)).toBe(true);
        expect(esVencimientoValido('12/30', HOY)).toBe(true);
    });

    it('rechaza una tarjeta vencida o con otro formato', () => {
        expect(esVencimientoValido('10/26', HOY)).toBe(false);
        expect(esVencimientoValido('13/27', HOY)).toBe(false);
        expect(esVencimientoValido('1/27', HOY)).toBe(false);
        expect(esVencimientoValido('12/2027', HOY)).toBe(false);
    });
});

describe('referencia del intento', () => {
    it('tiene el formato PAY-AAAAMMDD-XXXXXX con la fecha de El Salvador', () => {
        expect(generarReferencia('2026-11-15')).toMatch(/^PAY-20261115-[A-Z0-9]{6}$/);
        expect(generarReferencia('2026-11-15', () => 0)).toBe('PAY-20261115-AAAAAA');
    });
});

describe('desglosarIva · IVA 13 % incluido, redondeo half-up a dos decimales', () => {
    it.each([
        // total   subtotal = total / 1.13   IVA = total − subtotal
        [35.5, 31.42, 4.08], //   31.4159… → 31.42
        [50, 44.25, 5.75], //     44.2477… → 44.25
        [12.5, 11.06, 1.44], //   11.0619… → 11.06
    ])('prueba del cálculo con tres montos: %s → subtotal %s + IVA %s', (total, subtotal, iva) => {
        expect(desglosarIva(total)).toEqual({ subtotal, iva, total });
    });

    it('acepta el monto como texto con dos decimales (Decimal de Prisma)', () => {
        expect(desglosarIva('35.50')).toEqual({ subtotal: 31.42, iva: 4.08, total: 35.5 });
        expect(desglosarIva('0.01')).toEqual({ subtotal: 0.01, iva: 0, total: 0.01 });
    });

    it('redondea half-up igual que un cálculo independiente con cociente y resto, de $0.01 a $10,000.00', () => {
        const diferencias: string[] = [];
        for (let centavos = 1; centavos <= 1_000_000; centavos += 7) {
            // Referencia: subtotal = c × 100 / 113; si el resto es la mitad o más, se sube un centavo.
            const cociente = Math.floor((centavos * 100) / 113);
            const resto = centavos * 100 - cociente * 113;
            const esperado = resto * 2 >= 113 ? cociente + 1 : cociente;

            const { subtotal, iva, total } = desglosarIva((centavos / 100).toFixed(2));
            const suma = Math.round((subtotal + iva) * 100);
            if (Math.round(subtotal * 100) !== esperado || suma !== Math.round(total * 100)) {
                diferencias.push(`${centavos / 100}: subtotal ${subtotal} (esperado ${esperado / 100}), suma ${suma / 100}`);
            }
        }
        expect(diferencias).toEqual([]);
    });
});
