import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { DetalleIngresosQueryDto } from './detalle-ingresos-query.dto.js';

const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
const validar = (query: Record<string, unknown>) => pipe.transform(query, { type: 'query', metatype: DetalleIngresosQueryDto });

describe('H27 DTO de detalle: concepto obligatorio, página y rango heredado', () => {
    it.each(['MEMBRESIA', 'RENOVACION', 'SESION_ADICIONAL'])('acepta concepto %s y página por defecto ausente', async (concepto) => {
        expect(await validar({ concepto })).toMatchObject({ concepto });
    });
    it.each(['1', '2', '999999999', String(Number.MAX_SAFE_INTEGER)])('convierte la página entera %s', async (pagina) => {
        expect(await validar({ concepto: 'MEMBRESIA', pagina })).toMatchObject({ pagina: Number(pagina) });
    });
    it.each(['', '0', '-1', '1.5', '1e2', 'Infinity', 'NaN', 'abc', String(Number.MAX_SAFE_INTEGER + 1), ['1', '2']])('rechaza página %j', async (pagina) => {
        await expect(validar({ concepto: 'MEMBRESIA', pagina })).rejects.toThrow(BadRequestException);
    });
    it.each([{}, { concepto: '' }, { concepto: 'OTRO' }, { concepto: ['MEMBRESIA', 'RENOVACION'] }])('rechaza concepto ausente/inválido %j', async (query) => {
        await expect(validar(query)).rejects.toThrow(BadRequestException);
    });
    it('hereda formato de fechas y rechaza filtros ajenos al contrato', async () => {
        expect(await validar({ concepto: 'MEMBRESIA', desde: '2026-11-01', hasta: '2026-11-18' })).toMatchObject({ desde: '2026-11-01', hasta: '2026-11-18' });
        await expect(validar({ concepto: 'MEMBRESIA', desde: 'ayer' })).rejects.toThrow(BadRequestException);
        await expect(validar({ concepto: 'MEMBRESIA', miembroId: 'ajeno' })).rejects.toThrow(BadRequestException);
    });
});
