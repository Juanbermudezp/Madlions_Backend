import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
    BUSQUEDA_COBRO_INVALIDA,
    CONCEPTO_COBRO_INVALIDO,
    CobrosAdminQueryDto,
    PAGINA_INVALIDA,
} from './cobros-admin-query.dto.js';
import { ESTADO_COBRO_INVALIDO } from './cobros-query.dto.js';

const convertir = (datos: Record<string, unknown>) => plainToInstance(CobrosAdminQueryDto, datos);
const errores = async (datos: Record<string, unknown>) =>
    validate(convertir(datos), { whitelist: true, forbidNonWhitelisted: true });
const mensajes = async (datos: Record<string, unknown>) =>
    (await errores(datos)).flatMap((e) => Object.values(e.constraints ?? {}));

describe('CobrosAdminQueryDto', () => {
    it('acepta la query vacía y todos los filtros válidos', async () => {
        for (const datos of [
            {},
            { estado: 'PENDIENTE' },
            { estado: 'PAGADO', concepto: 'RENOVACION', q: 'lópez', pagina: '3' },
            { concepto: 'MEMBRESIA' },
            { concepto: 'SESION_ADICIONAL' },
            { q: '' },
        ]) {
            expect(await errores(datos)).toHaveLength(0);
        }
    });

    it('convierte la página a número y quita los espacios de la búsqueda', () => {
        const dto = convertir({ pagina: '2', q: '  MBR-000001  ' });
        expect(dto.pagina).toBe(2);
        expect(dto.q).toBe('MBR-000001');
    });

    it.each([
        [{ estado: 'ANULADO' }, ESTADO_COBRO_INVALIDO],
        [{ estado: 'pendiente' }, ESTADO_COBRO_INVALIDO],
        [{ concepto: 'CLASE' }, CONCEPTO_COBRO_INVALIDO],
        [{ q: 'x'.repeat(101) }, BUSQUEDA_COBRO_INVALIDA],
        [{ pagina: '0' }, PAGINA_INVALIDA],
        [{ pagina: '-1' }, PAGINA_INVALIDA],
        [{ pagina: '1.5' }, PAGINA_INVALIDA],
        [{ pagina: 'abc' }, PAGINA_INVALIDA],
    ])('rechaza %o con un único mensaje', async (datos, mensaje) => {
        expect(await mensajes(datos)).toEqual([mensaje]);
    });

    it('rechaza parámetros que no existen', async () => {
        expect((await errores({ miembroId: 'otro' })).map((e) => e.property)).toContain('miembroId');
    });
});