import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { OperacionMembresiaDto } from './operacion-membresia.dto.js';

const opciones = { whitelist: true, forbidNonWhitelisted: true };
const valido = {
    miembroId: '5b0c1d2e-3f40-4a51-8b62-7c83d94ea5f6',
    planId: '6c1d2e3f-4051-4b62-9c73-8d94ea5fb607',
};
const errores = async (datos: Record<string, unknown>) =>
    (await validate(plainToInstance(OperacionMembresiaDto, datos), opciones)).map((e) => e.property);

describe('OperacionMembresiaDto', () => {
    it('acepta miembro y plan, con o sin fecha de inicio', async () => {
        expect(await errores(valido)).toEqual([]);
        expect(await errores({ ...valido, fechaInicio: '2026-11-20' })).toEqual([]);
    });

    it('rechaza ids que no son uuid o que faltan', async () => {
        expect(await errores({ ...valido, miembroId: 'abc' })).toContain('miembroId');
        expect(await errores({ planId: valido.planId })).toContain('miembroId');
        expect(await errores({ miembroId: valido.miembroId })).toContain('planId');
    });

    it('rechaza fechas con otro formato o inexistentes', async () => {
        expect(await errores({ ...valido, fechaInicio: '20/11/2026' })).toContain('fechaInicio');
        expect(await errores({ ...valido, fechaInicio: '2026-02-30' })).toContain('fechaInicio');
    });

    it('rechaza campos que no son del contrato (el tipo de operación lo decide el servidor)', async () => {
        expect(await errores({ ...valido, tipoOperacion: 'COMPRA' })).toContain('tipoOperacion');
    });
});
