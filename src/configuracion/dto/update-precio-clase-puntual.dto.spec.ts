import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
    PRECIO_CLASE_PUNTUAL_INVALIDO,
    UpdatePrecioClasePuntualDto,
} from './update-precio-clase-puntual.dto.js';

// Las mismas opciones del ValidationPipe global de main.ts.
const opciones = { whitelist: true, forbidNonWhitelisted: true };

async function errores(datos: Record<string, unknown>) {
    const lista = await validate(plainToInstance(UpdatePrecioClasePuntualDto, datos), opciones);
    return lista.map((e) => e.property);
}

describe('UpdatePrecioClasePuntualDto', () => {
    it('acepta precios mayores que 0 con hasta 2 decimales', async () => {
        expect(await errores({ precio: 0.01 })).toEqual([]);
        expect(await errores({ precio: 12.5 })).toEqual([]);
        expect(await errores({ precio: 12.55 })).toEqual([]);
        expect(await errores({ precio: 10 })).toEqual([]);
        expect(await errores({ precio: 99_999_999.99 })).toEqual([]);
    });

    it('rechaza 0 y negativos', async () => {
        expect(await errores({ precio: 0 })).toContain('precio');
        expect(await errores({ precio: -1 })).toContain('precio');
    });

    it('rechaza más de 2 decimales', async () => {
        expect(await errores({ precio: 12.555 })).toContain('precio');
    });

    it('rechaza precio ausente, como texto, nulo o demasiado grande', async () => {
        expect(await errores({})).toContain('precio');
        expect(await errores({ precio: '12.50' })).toContain('precio');
        expect(await errores({ precio: null })).toContain('precio');
        expect(await errores({ precio: 100_000_000 })).toContain('precio');
    });

    it('devuelve un único mensaje aunque el precio falle varias reglas', async () => {
        for (const datos of [{}, { precio: '12.50' }, { precio: null }, { precio: -1.555 }]) {
            const lista = await validate(plainToInstance(UpdatePrecioClasePuntualDto, datos), opciones);
            expect(lista).toHaveLength(1);
            expect(Object.values(lista[0].constraints ?? {})).toEqual([PRECIO_CLASE_PUNTUAL_INVALIDO]);
        }
    });

    it('rechaza campos que no son del contrato', async () => {
        expect(await errores({ precio: 12.5, clave: 'otra' })).toContain('clave');
    });
});
