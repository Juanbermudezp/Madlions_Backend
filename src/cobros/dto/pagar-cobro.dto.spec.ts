import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
    CVV_INVALIDO,
    NUMERO_TARJETA_INVALIDO,
    PagarCobroDto,
    TITULAR_INVALIDO,
    VENCIMIENTO_INVALIDO,
} from './pagar-cobro.dto.js';

const valido = { titular: 'María López', numero: '4242 4242 4242 4242', vencimiento: '12/30', cvv: '123' };
const errores = async (datos: Record<string, unknown>) => {
    const lista = await validate(plainToInstance(PagarCobroDto, datos), { whitelist: true, forbidNonWhitelisted: true });
    return Object.fromEntries(lista.map((e) => [e.property, Object.values(e.constraints ?? {})]));
};

describe('PagarCobroDto', () => {
    it('acepta una tarjeta válida', async () => {
        expect(await errores(valido)).toEqual({});
    });

    it.each([
        ['titular', '', TITULAR_INVALIDO],
        ['titular', 'M', TITULAR_INVALIDO],
        ['numero', '4242424242424241', NUMERO_TARJETA_INVALIDO],
        ['numero', '1234', NUMERO_TARJETA_INVALIDO],
        ['vencimiento', '01/20', VENCIMIENTO_INVALIDO],
        ['vencimiento', '2030-12', VENCIMIENTO_INVALIDO],
        ['cvv', '12', CVV_INVALIDO],
        ['cvv', 'abc', CVV_INVALIDO],
    ])('%s = %j → 400 con un único mensaje', async (campo, valor, mensaje) => {
        expect(await errores({ ...valido, [campo]: valor })).toEqual({ [campo]: [mensaje] });
    });

    it('los mensajes de error nunca repiten el número ni el código de seguridad enviados', async () => {
        const lista = await validate(
            plainToInstance(PagarCobroDto, { ...valido, numero: '4242424242424241', cvv: '99' }),
        );
        const texto = JSON.stringify(lista.map((e) => e.constraints));
        expect(texto).not.toContain('4242424242424241');
        expect(texto).not.toContain('"99"');
    });
});
