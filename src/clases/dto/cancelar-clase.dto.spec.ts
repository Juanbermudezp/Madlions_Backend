import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CancelarClaseDto } from './cancelar-clase.dto.js';

const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
const validar = (body: unknown) => pipe.transform(body, { type: 'body', metatype: CancelarClaseDto });
describe('H7 CancelarClaseDto', () => {
    it.each([10, 250])('acepta%s caracteres', async (n) => {
        expect(await validar({ motivo: 'a'.repeat(n) })).toMatchObject({ motivo: 'a'.repeat(n) });
    });
    it.each([9, 251])('rechaza%s caracteres', async (n) => {
        await expect(validar({ motivo: 'a'.repeat(n) })).rejects.toThrow(BadRequestException);
    });
    it.each([{}, { motivo: '' }, { motivo: ' '.repeat(20) }, { motivo: null }, { motivo: 1234567890 }, { motivo: ['motivo inválido'] },
        { motivo: 'a'.repeat(10), canceladaPorId: 'usuario-cliente' }, { motivo: 'a'.repeat(10), estado: 'PROGRAMADA' }])('rechaza cuerpo%j', async (body) => {
        await expect(validar(body)).rejects.toThrow(BadRequestException);
    });
    it('recorta espacios y cuenta Unicode de forma compatible con varchar', async () => {
        expect(await validar({ motivo: `  ${'a'.repeat(10)}  ` })).toMatchObject({ motivo: 'a'.repeat(10) });
        expect(await validar({ motivo: '💪'.repeat(250) })).toMatchObject({ motivo: '💪'.repeat(250) });
        await expect(validar({ motivo: '💪'.repeat(251) })).rejects.toThrow(BadRequestException);
    });
});
