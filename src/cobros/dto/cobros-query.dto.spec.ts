import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CobrosQueryDto, ESTADO_COBRO_INVALIDO } from './cobros-query.dto.js';

const errores = async (datos: Record<string, unknown>) =>
    validate(plainToInstance(CobrosQueryDto, datos), { whitelist: true, forbidNonWhitelisted: true });

describe('CobrosQueryDto', () => {
    it('acepta sin estado, PENDIENTE o PAGADO', async () => {
        for (const datos of [{}, { estado: 'PENDIENTE' }, { estado: 'PAGADO' }]) {
            expect(await errores(datos)).toHaveLength(0);
        }
    });

    it('rechaza otro estado con un único mensaje', async () => {
        const lista = await errores({ estado: 'ANULADO' });
        expect(Object.values(lista[0].constraints ?? {})).toEqual([ESTADO_COBRO_INVALIDO]);
    });

    it('no acepta un id de miembro', async () => {
        expect((await errores({ miembroId: 'otro' })).map((e) => e.property)).toContain('miembroId');
    });
});
