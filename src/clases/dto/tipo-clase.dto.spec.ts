import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTipoClaseDto } from './create-tipo-clase.dto.js';
import { UpdateTipoClaseDto } from './update-tipo-clase.dto.js';

// Las mismas opciones del ValidationPipe global de main.ts.
const opciones = { whitelist: true, forbidNonWhitelisted: true };

const valido = { nombre: 'Yoga', descripcion: 'Posturas, respiración y flexibilidad.' };

async function erroresCreate(datos: Record<string, unknown>) {
    const errores = await validate(plainToInstance(CreateTipoClaseDto, datos), opciones);
    return errores.map((e) => e.property);
}

async function erroresUpdate(datos: Record<string, unknown>) {
    const errores = await validate(plainToInstance(UpdateTipoClaseDto, datos), opciones);
    return errores.map((e) => e.property);
}

describe('CreateTipoClaseDto', () => {
    it('acepta un tipo válido', async () => {
        expect(await erroresCreate(valido)).toEqual([]);
    });

    it('quita los espacios de los extremos del nombre', () => {
        expect(plainToInstance(CreateTipoClaseDto, { ...valido, nombre: '  Yoga  ' }).nombre).toBe('Yoga');
    });

    it('acepta nombres de 2 y de 40 caracteres', async () => {
        expect(await erroresCreate({ ...valido, nombre: 'TR' })).toEqual([]);
        expect(await erroresCreate({ ...valido, nombre: 'x'.repeat(40) })).toEqual([]);
    });

    it('rechaza nombres de 1 o de 41 caracteres, o solo con espacios', async () => {
        expect(await erroresCreate({ ...valido, nombre: 'Y' })).toContain('nombre');
        expect(await erroresCreate({ ...valido, nombre: 'x'.repeat(41) })).toContain('nombre');
        expect(await erroresCreate({ ...valido, nombre: '     ' })).toContain('nombre');
    });

    it('exige la descripción y la limita a 300 caracteres', async () => {
        expect(await erroresCreate({ nombre: 'Yoga' })).toContain('descripcion');
        expect(await erroresCreate({ ...valido, descripcion: '' })).toContain('descripcion');
        expect(await erroresCreate({ ...valido, descripcion: 'x'.repeat(301) })).toContain('descripcion');
    });

    it('rechaza campos que no son del contrato', async () => {
        expect(await erroresCreate({ ...valido, activo: false })).toContain('activo');
    });
});

describe('UpdateTipoClaseDto', () => {
    it('acepta enviar solo un campo', async () => {
        expect(await erroresUpdate({ descripcion: 'Nueva descripción' })).toEqual([]);
        expect(await erroresUpdate({ nombre: 'Yoga suave' })).toEqual([]);
    });

    it('aplica las mismas reglas que al crear', async () => {
        expect(await erroresUpdate({ nombre: 'Y' })).toContain('nombre');
        expect(await erroresUpdate({ descripcion: 'x'.repeat(301) })).toContain('descripcion');
    });
});
