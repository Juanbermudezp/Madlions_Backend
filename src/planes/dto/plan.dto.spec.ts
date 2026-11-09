import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePlanDto } from './create-plan.dto.js';
import { UpdatePlanDto } from './update-plan.dto.js';

// Las mismas opciones del ValidationPipe global de main.ts.
const opciones = { whitelist: true, forbidNonWhitelisted: true };

const TIPO_CLASE_ID = '5b0c1d2e-3f40-4a51-8b62-7c83d94ea5f6';
const OTRO_TIPO_CLASE_ID = '6c1d2e3f-4051-4b62-9c73-8d94ea5fb607';

const valido = {
    nombre: 'Mensual ilimitado',
    tipo: 'MENSUAL',
    precio: 35.5,
    beneficios: 'Acceso ilimitado a sala de máquinas.',
    tiposClaseIds: [TIPO_CLASE_ID],
};

async function erroresCreate(datos: Record<string, unknown>) {
    const errores = await validate(plainToInstance(CreatePlanDto, datos), opciones);
    return errores.map((e) => e.property);
}

async function erroresUpdate(datos: Record<string, unknown>) {
    const errores = await validate(plainToInstance(UpdatePlanDto, datos), opciones);
    return errores.map((e) => e.property);
}

describe('CreatePlanDto', () => {
    it('acepta un plan válido', async () => {
        expect(await erroresCreate(valido)).toEqual([]);
        expect(await erroresCreate({ ...valido, tipo: 'SET_CLASES', cantidadClases: 10 })).toEqual([]);
    });

    describe('nombre', () => {
        it('quita los espacios de los extremos', () => {
            expect(plainToInstance(CreatePlanDto, { ...valido, nombre: '  Mensual  ' }).nombre).toBe('Mensual');
        });

        it('acepta hasta 60 caracteres', async () => {
            expect(await erroresCreate({ ...valido, nombre: 'x'.repeat(60) })).toEqual([]);
        });

        it('rechaza nombre ausente, vacío, solo espacios o de 61 caracteres', async () => {
            const { nombre: _nombre, ...sinNombre } = valido;
            expect(await erroresCreate(sinNombre)).toContain('nombre');
            expect(await erroresCreate({ ...valido, nombre: '' })).toContain('nombre');
            expect(await erroresCreate({ ...valido, nombre: '    ' })).toContain('nombre');
            expect(await erroresCreate({ ...valido, nombre: 'x'.repeat(61) })).toContain('nombre');
        });
    });

    describe('tipo', () => {
        it('acepta DAYPASS, MENSUAL y SET_CLASES', async () => {
            expect(await erroresCreate({ ...valido, tipo: 'DAYPASS' })).toEqual([]);
            expect(await erroresCreate({ ...valido, tipo: 'MENSUAL' })).toEqual([]);
            expect(await erroresCreate({ ...valido, tipo: 'SET_CLASES', cantidadClases: 5 })).toEqual([]);
        });

        it('rechaza un tipo ausente o desconocido', async () => {
            const { tipo: _tipo, ...sinTipo } = valido;
            expect(await erroresCreate(sinTipo)).toContain('tipo');
            expect(await erroresCreate({ ...valido, tipo: 'ANUAL' })).toContain('tipo');
        });
    });

    describe('precio', () => {
        it('acepta valores positivos con hasta 2 decimales', async () => {
            expect(await erroresCreate({ ...valido, precio: 0.01 })).toEqual([]);
            expect(await erroresCreate({ ...valido, precio: 10 })).toEqual([]);
            expect(await erroresCreate({ ...valido, precio: 99_999_999.99 })).toEqual([]);
        });

        it('rechaza 0 y negativos', async () => {
            expect(await erroresCreate({ ...valido, precio: 0 })).toContain('precio');
            expect(await erroresCreate({ ...valido, precio: -5 })).toContain('precio');
        });

        it('rechaza más de 2 decimales', async () => {
            expect(await erroresCreate({ ...valido, precio: 10.555 })).toContain('precio');
        });

        it('rechaza precio ausente, como texto o mayor de lo que cabe en DECIMAL(10,2)', async () => {
            const { precio: _precio, ...sinPrecio } = valido;
            expect(await erroresCreate(sinPrecio)).toContain('precio');
            expect(await erroresCreate({ ...valido, precio: '10' })).toContain('precio');
            expect(await erroresCreate({ ...valido, precio: 100_000_000 })).toContain('precio');
        });
    });

    describe('cantidadClases', () => {
        it('es opcional en el DTO (la regla por tipo la aplica el servicio)', async () => {
            expect(await erroresCreate(valido)).toEqual([]);
        });

        it('acepta enteros de 1 a 100', async () => {
            expect(await erroresCreate({ ...valido, tipo: 'SET_CLASES', cantidadClases: 1 })).toEqual([]);
            expect(await erroresCreate({ ...valido, tipo: 'SET_CLASES', cantidadClases: 100 })).toEqual([]);
        });

        it('rechaza 0, 101 y decimales', async () => {
            expect(await erroresCreate({ ...valido, tipo: 'SET_CLASES', cantidadClases: 0 })).toContain('cantidadClases');
            expect(await erroresCreate({ ...valido, tipo: 'SET_CLASES', cantidadClases: 101 })).toContain('cantidadClases');
            expect(await erroresCreate({ ...valido, tipo: 'SET_CLASES', cantidadClases: 2.5 })).toContain('cantidadClases');
        });
    });

    describe('beneficios', () => {
        it('acepta hasta 500 caracteres', async () => {
            expect(await erroresCreate({ ...valido, beneficios: 'x'.repeat(500) })).toEqual([]);
        });

        it('rechaza beneficios ausentes, vacíos o de 501 caracteres', async () => {
            const { beneficios: _beneficios, ...sinBeneficios } = valido;
            expect(await erroresCreate(sinBeneficios)).toContain('beneficios');
            expect(await erroresCreate({ ...valido, beneficios: '  ' })).toContain('beneficios');
            expect(await erroresCreate({ ...valido, beneficios: 'x'.repeat(501) })).toContain('beneficios');
        });
    });

    describe('tiposClaseIds', () => {
        it('acepta una lista de uuid distintos, o vacía', async () => {
            expect(await erroresCreate({ ...valido, tiposClaseIds: [TIPO_CLASE_ID, OTRO_TIPO_CLASE_ID] })).toEqual([]);
            expect(await erroresCreate({ ...valido, tiposClaseIds: [] })).toEqual([]);
        });

        it('rechaza la lista ausente, que no sea lista, con ids inválidos o repetidos', async () => {
            const { tiposClaseIds: _ids, ...sinIds } = valido;
            expect(await erroresCreate(sinIds)).toContain('tiposClaseIds');
            expect(await erroresCreate({ ...valido, tiposClaseIds: TIPO_CLASE_ID })).toContain('tiposClaseIds');
            expect(await erroresCreate({ ...valido, tiposClaseIds: ['no-es-uuid'] })).toContain('tiposClaseIds');
            expect(await erroresCreate({ ...valido, tiposClaseIds: [TIPO_CLASE_ID, TIPO_CLASE_ID] })).toContain('tiposClaseIds');
        });
    });

    it('rechaza campos que no son del contrato', async () => {
        expect(await erroresCreate({ ...valido, duracionDias: 30 })).toContain('duracionDias');
        expect(await erroresCreate({ ...valido, activo: false })).toContain('activo');
    });
});

describe('UpdatePlanDto', () => {
    it('acepta un cuerpo vacío o con un solo campo', async () => {
        expect(await erroresUpdate({})).toEqual([]);
        expect(await erroresUpdate({ precio: 40 })).toEqual([]);
        expect(await erroresUpdate({ tiposClaseIds: [TIPO_CLASE_ID] })).toEqual([]);
    });

    it('acepta el campo tipo sin responder 400 (el servicio lo ignora)', async () => {
        expect(await erroresUpdate({ tipo: 'DAYPASS', precio: 40 })).toEqual([]);
    });

    it('aplica las mismas reglas que al crear', async () => {
        expect(await erroresUpdate({ nombre: '' })).toContain('nombre');
        expect(await erroresUpdate({ nombre: 'x'.repeat(61) })).toContain('nombre');
        expect(await erroresUpdate({ precio: 0 })).toContain('precio');
        expect(await erroresUpdate({ precio: 1.234 })).toContain('precio');
        expect(await erroresUpdate({ cantidadClases: 101 })).toContain('cantidadClases');
        expect(await erroresUpdate({ beneficios: 'x'.repeat(501) })).toContain('beneficios');
        expect(await erroresUpdate({ tiposClaseIds: ['no-es-uuid'] })).toContain('tiposClaseIds');
        expect(await erroresUpdate({ tiposClaseIds: [TIPO_CLASE_ID, TIPO_CLASE_ID] })).toContain('tiposClaseIds');
    });

    it('rechaza campos que no son del contrato', async () => {
        expect(await erroresUpdate({ activo: false })).toContain('activo');
        expect(await erroresUpdate({ duracionDias: 1 })).toContain('duracionDias');
    });
});
