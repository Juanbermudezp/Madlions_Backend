import { BadRequestException, ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { ClaseConRelaciones, ClaseRepository, TipoClaseRepository } from '@Clases/repositories';
import { ActividadTraslapadaError } from '@Clases/errors';
import { ClasesController, TiposClaseController } from '@Clases/controllers';
import { CreateClaseDto, CreateTipoClaseDto, CUPO_INVALIDO } from '@Clases/dto';
import { EstadoClase, Rol } from '@PrismaClient';
import { rolesPermitidos } from '../../../test/helpers/roles.js';
import { ClasesService, MENSAJES_CLASE } from './clases.service.js';
import { TiposClaseService } from './tipos-clase.service.js';

const AHORA = new Date('2026-11-09T15:00:00Z'); // lunes 09:00 en El Salvador
const opciones = { whitelist: true, forbidNonWhitelisted: true };

function clase(datos: Partial<ClaseConRelaciones> = {}): ClaseConRelaciones {
    return {
        id: 'c1',
        tipoClaseId: 't1',
        entrenadorId: 'e1',
        descripcion: null,
        inicio: new Date('2026-11-10T13:00:00Z'), // martes 07:00
        fin: new Date('2026-11-10T14:00:00Z'),
        cupoMaximo: 20,
        estado: EstadoClase.PROGRAMADA,
        motivoCancelacion: null,
        canceladaEn: null,
        canceladaPorId: null,
        creadoEn: AHORA,
        tipoClase: { id: 't1', nombre: 'Yoga', descripcion: 'Posturas', activo: true, creadoEn: AHORA },
        entrenador: { id: 'e1', nombre: 'Carlos', apellido: 'Martínez' },
        ...datos,
    };
}

const dtoCrear = {
    tipoClaseId: '21d9fa0e-89ca-4516-a43c-6b6b8f773940',
    entrenadorId: '89aa5f94-bbdf-401c-b7f9-ca3f9bfff7eb',
    fecha: '2026-11-10',
    horaInicio: '07:00',
    horaFin: '08:00',
    cupoMaximo: 20,
};

async function mensajes(clase: new () => object, datos: object) {
    const errores = await validate(plainToInstance(clase, datos) as object, opciones);
    return errores.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('H4. Programación de clases grupales', () => {
    const repo = {
        findEntre: vi.fn(),
        findById: vi.fn(),
        existeTipoClaseActivo: vi.fn(),
        existeEntrenadorActivo: vi.fn(),
        contarReservasConfirmadas: vi.fn(),
        crearSinTraslape: vi.fn(),
        actualizarSinTraslape: vi.fn(),
    };
    const tiposRepo = { findActivos: vi.fn(), findPorNombre: vi.fn(), create: vi.fn(), findById: vi.fn(), update: vi.fn() };
    const service = new ClasesService(repo as unknown as ClaseRepository);
    const tipos = new TiposClaseService(tiposRepo as unknown as TipoClaseRepository);

    beforeEach(() => {
        vi.resetAllMocks();
        repo.existeTipoClaseActivo.mockResolvedValue(true);
        repo.existeEntrenadorActivo.mockResolvedValue(true);
        repo.contarReservasConfirmadas.mockImplementation((ids: string[]) => Promise.resolve(new Map(ids.map((id) => [id, 0]))));
    });

    it('AC1: registra un tipo de clase con nombre único de 2 a 40 caracteres', async () => {
        expect(await mensajes(CreateTipoClaseDto, { nombre: 'Yo', descripcion: 'Posturas' })).toEqual([]);
        expect(await mensajes(CreateTipoClaseDto, { nombre: 'Y', descripcion: 'Posturas' })).not.toEqual([]);
        expect(await mensajes(CreateTipoClaseDto, { nombre: 'x'.repeat(41), descripcion: 'Posturas' })).not.toEqual([]);

        tiposRepo.findPorNombre.mockResolvedValue(null);
        tiposRepo.create.mockResolvedValue({ id: 't9', nombre: 'Pilates', descripcion: 'Core', activo: true, creadoEn: AHORA });
        await expect(tipos.crear({ nombre: 'Pilates', descripcion: 'Core' })).resolves.toMatchObject({ id: 't9', nombre: 'Pilates' });

        tiposRepo.findPorNombre.mockResolvedValue({ id: 't1' });
        await expect(tipos.crear({ nombre: 'yoga', descripcion: 'x' })).rejects.toThrow(
            new ConflictException('Ya existe un tipo de clase con ese nombre'),
        );
    });

    it('AC2: registra una clase que queda "Programada" con su propio id', async () => {
        repo.crearSinTraslape.mockResolvedValue(clase({ id: 'c9' }));

        const res = await service.crear(dtoCrear, AHORA);

        expect(res).toMatchObject({ id: 'c9', estado: EstadoClase.PROGRAMADA, cupoMaximo: 20, reservasConfirmadas: 0 });
        expect(repo.crearSinTraslape).toHaveBeenCalledWith(expect.objectContaining({
            inicio: new Date('2026-11-10T13:00:00Z'),
            fin: new Date('2026-11-10T14:00:00Z'),
            cupoMaximo: 20,
        }));
    });

    it('AC3: la agenda de una semana (lunes a domingo) trae tipo, entrenador, horario, cupo, reservas y estado', async () => {
        repo.findEntre.mockResolvedValue([clase()]);
        repo.contarReservasConfirmadas.mockResolvedValue(new Map([['c1', 5]]));

        const [c] = await service.listarAgenda('2026-11-12', AHORA);

        expect(repo.findEntre).toHaveBeenCalledWith(new Date('2026-11-09T06:00:00Z'), new Date('2026-11-16T06:00:00Z'));
        expect(c).toMatchObject({
            tipo: { id: 't1', nombre: 'Yoga' },
            entrenador: { id: 'e1', nombre: 'Carlos Martínez' },
            cupoMaximo: 20,
            reservasConfirmadas: 5,
            estado: EstadoClase.PROGRAMADA,
        });
    });

    it('AC4: modifica una clase programada pero no deja bajar el cupo por debajo de las reservas confirmadas', async () => {
        repo.findById.mockResolvedValue(clase());
        repo.contarReservasConfirmadas.mockResolvedValue(new Map([['c1', 8]]));
        repo.actualizarSinTraslape.mockResolvedValue(clase({ cupoMaximo: 8 }));

        await expect(service.actualizar('c1', { cupoMaximo: 8 }, AHORA)).resolves.toMatchObject({ cupoMaximo: 8 });
        await expect(service.actualizar('c1', { cupoMaximo: 7 }, AHORA)).rejects.toThrow(
            new ConflictException(MENSAJES_CLASE.cupoMenorQueReservas(8)),
        );
    });

    it('AC5: rechaza cupo fuera de 1 a 50, hora de fin no posterior o fecha pasada', async () => {
        expect(await mensajes(CreateClaseDto, { ...dtoCrear, cupoMaximo: 0 })).toEqual([CUPO_INVALIDO]);
        expect(await mensajes(CreateClaseDto, { ...dtoCrear, cupoMaximo: 51 })).toEqual([CUPO_INVALIDO]);

        await expect(service.crear({ ...dtoCrear, horaFin: '07:00' }, AHORA)).rejects.toThrow(
            new BadRequestException('La hora de fin debe ser posterior a la de inicio.'),
        );
        await expect(service.crear({ ...dtoCrear, fecha: '2026-11-08' }, AHORA)).rejects.toThrow(
            new BadRequestException('La fecha y hora de inicio ya pasaron.'),
        );
        expect(repo.crearSinTraslape).not.toHaveBeenCalled();
    });

    it('AC6: si el entrenador ya tiene una actividad en ese horario la clase no se guarda', async () => {
        repo.crearSinTraslape.mockRejectedValue(new ActividadTraslapadaError());

        await expect(service.crear(dtoCrear, AHORA)).rejects.toThrow(
            new ConflictException('El entrenador ya tiene una actividad en ese horario'),
        );
    });

    it('AC7: una clase cancelada o ya iniciada no se puede modificar', async () => {
        repo.findById.mockResolvedValue(clase({ estado: EstadoClase.CANCELADA_GIMNASIO }));
        await expect(service.actualizar('c1', { cupoMaximo: 10 }, AHORA)).rejects.toThrow(
            new ConflictException('No se puede modificar una clase cancelada'),
        );

        repo.findById.mockResolvedValue(clase({ inicio: new Date('2026-11-09T14:00:00Z'), fin: new Date('2026-11-09T16:00:00Z') }));
        await expect(service.actualizar('c1', { cupoMaximo: 10 }, AHORA)).rejects.toThrow(
            new ConflictException('No se puede modificar una clase que ya empezó o terminó'),
        );
        expect(repo.actualizarSinTraslape).not.toHaveBeenCalled();
    });

    it('AC8: solo el administrador puede crear o modificar clases y tipos de clase', () => {
        for (const [controlador, metodo] of [
            [ClasesController, 'crear'],
            [ClasesController, 'actualizar'],
            [TiposClaseController, 'crear'],
            [TiposClaseController, 'actualizar'],
        ] as const) {
            expect(rolesPermitidos(controlador, metodo)).toEqual([Rol.ADMINISTRADOR]);
        }
    });
});
