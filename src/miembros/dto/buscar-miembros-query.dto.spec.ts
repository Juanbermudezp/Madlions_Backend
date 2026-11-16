import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BUSQUEDA_INVALIDA, BuscarMiembrosQueryDto } from './buscar-miembros-query.dto.js';

const opciones = { whitelist: true, forbidNonWhitelisted: true };

async function errores(datos: Record<string, unknown>) {
    return validate(plainToInstance(BuscarMiembrosQueryDto, datos), opciones);
}

describe('BuscarMiembrosQueryDto', () => {
    it('acepta de 2 a 50 caracteres', async () => {
        expect(await errores({ q: 'ma' })).toHaveLength(0);
        expect(await errores({ q: 'x'.repeat(50) })).toHaveLength(0);
    });

    it('quita los espacios de los extremos antes de medir', async () => {
        expect(plainToInstance(BuscarMiembrosQueryDto, { q: '  maria  ' }).q).toBe('maria');
        expect((await errores({ q: '  m  ' }))[0]?.property).toBe('q');
    });

    it('rechaza 1 o 51 caracteres, vacío o ausente, con un único mensaje', async () => {
        for (const datos of [{ q: 'm' }, { q: 'x'.repeat(51) }, { q: '' }, {}]) {
            const lista = await errores(datos);
            expect(lista).toHaveLength(1);
            expect(Object.values(lista[0].constraints ?? {})).toEqual([BUSQUEDA_INVALIDA]);
        }
    });

    it('rechaza parámetros que no son del contrato', async () => {
        expect((await errores({ q: 'maria', limite: '50' })).map((e) => e.property)).toContain('limite');
    });
});
