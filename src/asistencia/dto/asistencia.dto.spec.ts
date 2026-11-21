import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AsistenciaReserva } from '@PrismaClient';
import { MarcarAsistenciaDto, TipoActividad } from './marcar-asistencia.dto.js';
import { ActividadPendienteDto } from './actividad-pendiente-response.dto.js';
import type { ActividadConMiembros } from '../repositories/asistencia.repository.js';

const opciones = { whitelist: true, forbidNonWhitelisted: true };
const UUID = '03ad7341-2026-4eeb-8078-cc2ab2331f05';

async function errores(datos: Record<string, unknown>) {
    const dto = plainToInstance(MarcarAsistenciaDto, datos);
    const encontrados = await validate(dto, opciones);
    return encontrados.map((e) => e.property);
}

const MARCA = {
    tipo: TipoActividad.CLASE,
    registroId: UUID,
    asistencia: 'ASISTIO',
};

describe('MarcarAsistenciaDto', () => {
    it('acepta una marca', async () => {
        expect(await errores({ marcas: [MARCA] })).toEqual([]);
    });

    it('acepta varias marcas de los dos tipos', async () => {
        expect(
            await errores({
                marcas: [MARCA, { ...MARCA, tipo: 'SESION', asistencia: 'NO_ASISTIO' }],
            }),
        ).toEqual([]);
    });

    it('rechaza la lista vacía o ausente', async () => {
        expect(await errores({ marcas: [] })).toEqual(['marcas']);
        expect(await errores({})).toEqual(['marcas']);
    });

    it('rechaza un tipo que no existe', async () => {
        expect(await errores({ marcas: [{ ...MARCA, tipo: 'TALLER' }] })).toEqual(['marcas']);
    });

    it('rechaza "sin registrar" como marca', async () => {
        expect(
            await errores({ marcas: [{ ...MARCA, asistencia: 'SIN_REGISTRAR' }] }),
        ).toEqual(['marcas']);
    });

    it('rechaza un registro que no es UUID', async () => {
        expect(await errores({ marcas: [{ ...MARCA, registroId: 'r1' }] })).toEqual(['marcas']);
    });

    it('rechaza una marca a la que le falta un campo', async () => {
        expect(await errores({ marcas: [{ tipo: 'CLASE', registroId: UUID }] })).toEqual([
            'marcas',
        ]);
    });

    it('rechaza un campo fuera del contrato', async () => {
        expect(await errores({ marcas: [MARCA], entrenadorId: UUID })).toEqual(['entrenadorId']);
    });

    it('rechaza más de 100 marcas de una vez', async () => {
        const muchas = Array.from({ length: 101 }, () => MARCA);

        expect(await errores({ marcas: muchas })).toEqual(['marcas']);
    });
});

describe('ActividadPendienteDto', () => {
    const actividad: ActividadConMiembros = {
        tipo: TipoActividad.CLASE,
        id: 'c1',
        nombre: 'Spinning',
        inicio: new Date('2026-11-18T14:00:00.000Z'),
        fin: new Date('2026-11-18T15:00:00.000Z'),
        miembros: [
            {
                registroId: 'r1',
                nombre: 'María López',
                codigo: 'MBR-000002',
                asistencia: AsistenciaReserva.SIN_REGISTRAR,
            },
        ],
    };

    it('devuelve las fechas como instantes ISO', () => {
        const dto = ActividadPendienteDto.fromEntity(actividad);

        expect(dto.inicio).toBe('2026-11-18T14:00:00.000Z');
        expect(dto.fin).toBe('2026-11-18T15:00:00.000Z');
    });

    it('devuelve exactamente los campos del contrato', () => {
        expect(Object.keys(ActividadPendienteDto.fromEntity(actividad)).sort()).toEqual([
            'fin',
            'id',
            'inicio',
            'miembros',
            'nombre',
            'tipo',
        ]);
    });

    it('cada miembro trae su registro, nombre, código y asistencia', () => {
        const [miembro] = ActividadPendienteDto.fromEntity(actividad).miembros;

        expect(Object.keys(miembro).sort()).toEqual([
            'asistencia',
            'codigo',
            'nombre',
            'registroId',
        ]);
    });
});
