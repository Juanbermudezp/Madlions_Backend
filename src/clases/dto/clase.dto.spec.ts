import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateClaseDto, CUPO_INVALIDO } from './create-clase.dto.js';
import { UpdateClaseDto } from './update-clase.dto.js';

// Las mismas opciones del ValidationPipe global de main.ts.
const opciones = { whitelist: true, forbidNonWhitelisted: true };

const valido = {
    tipoClaseId: '21d9fa0e-89ca-4516-a43c-6b6b8f773940',
    entrenadorId: '89aa5f94-bbdf-401c-b7f9-ca3f9bfff7eb',
    fecha: '2026-11-12',
    horaInicio: '08:00',
    horaFin: '09:00',
    cupoMaximo: 20,
};

async function mensajes(clase: typeof CreateClaseDto | typeof UpdateClaseDto, datos: object) {
    const errores = await validate(plainToInstance(clase, datos), opciones);
    return errores.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('CreateClaseDto', () => {
    it('acepta una clase válida, con cupo 1 y con cupo 50', async () => {
        expect(await mensajes(CreateClaseDto, valido)).toEqual([]);
        expect(await mensajes(CreateClaseDto, { ...valido, cupoMaximo: 1 })).toEqual([]);
        expect(await mensajes(CreateClaseDto, { ...valido, cupoMaximo: 50 })).toEqual([]);
    });

    it('si falta el cupo devuelve un solo mensaje', async () => {
        const { cupoMaximo: _omitido, ...sinCupo } = valido;
        expect(await mensajes(CreateClaseDto, sinCupo)).toEqual([CUPO_INVALIDO]);
    });

    it('rechaza cupo 0, 51, decimal o como texto', async () => {
        for (const cupoMaximo of [0, 51, 2.5, '20']) {
            expect(await mensajes(CreateClaseDto, { ...valido, cupoMaximo })).toEqual([CUPO_INVALIDO]);
        }
    });

    it('rechaza ids que no son UUID y campos de más', async () => {
        expect(await mensajes(CreateClaseDto, { ...valido, entrenadorId: '123' })).toContain(
            'El entrenador no es válido.',
        );
        expect(await mensajes(CreateClaseDto, { ...valido, estado: 'CANCELADA_GIMNASIO' })).toHaveLength(1);
    });
});

describe('UpdateClaseDto', () => {
    it('acepta un cuerpo con un solo campo', async () => {
        expect(await mensajes(UpdateClaseDto, { cupoMaximo: 25 })).toEqual([]);
    });

    it('valida el cupo con las mismas reglas', async () => {
        expect(await mensajes(UpdateClaseDto, { cupoMaximo: 51 })).toEqual([CUPO_INVALIDO]);
    });
});
