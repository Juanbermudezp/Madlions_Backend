import { ResultadoPago } from '@PrismaClient';
import { PasarelaSimuladaService } from './pasarela-simulada.service.js';

const tarjeta = (numero: string) => ({ titular: 'María López', numero, vencimiento: '12/30', cvv: '123' });

describe('PasarelaSimuladaService', () => {
    afterEach(() => vi.useRealTimers());

    it('espera 2 segundos antes de responder', async () => {
        vi.useFakeTimers();
        const pasarela = new PasarelaSimuladaService();
        let respondio = false;
        const promesa = pasarela.procesar(tarjeta('4242424242424242')).then(() => (respondio = true));

        await vi.advanceTimersByTimeAsync(1999);
        expect(respondio).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        await promesa;
        expect(respondio).toBe(true);
    });

    it.each([
        ['4242424242424242', ResultadoPago.APROBADO],
        ['4000000000000002', ResultadoPago.RECHAZADO],
        ['4000000000000119', ResultadoPago.ERROR],
        ['5555555555554444', ResultadoPago.RECHAZADO],
    ])('tarjeta %s → %s, con su mensaje y solo los últimos 4 dígitos', async (numero, resultado) => {
        const respuesta = await new PasarelaSimuladaService(0).procesar(tarjeta(numero));
        expect(respuesta.resultado).toBe(resultado);
        expect(respuesta.ultimos4).toBe(numero.slice(-4));
        expect(respuesta.mensaje.length).toBeGreaterThan(0);
        expect(JSON.stringify(respuesta)).not.toContain(numero);
        expect(JSON.stringify(respuesta)).not.toContain('123');
    });
});
