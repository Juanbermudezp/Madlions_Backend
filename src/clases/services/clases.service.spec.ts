import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common';
import type { ClaseConRelaciones, ClaseRepository } from '@Clases/repositories';
import { ActividadTraslapadaError, ClaseNoModificableError } from '@Clases/errors';
import { EstadoClase } from '@PrismaClient';
import { ClasesService, MENSAJES_CLASE } from './clases.service.js';

const AHORA = new Date('2026-11-09T15:00:00Z'); // lunes 09:00 en El Salvador

function clase(datos: Partial<ClaseConRelaciones> = {}): ClaseConRelaciones {
    return {
        id: 'c1',
        tipoClaseId: 't1',
        entrenadorId: 'e1',
        descripcion: null,
        inicio: new Date('2026-11-10T13:00:00Z'), // martes 07:00
        fin: new Date('2026-11-10T14:00:00Z'), // martes 08:00
        cupoMaximo: 20,
        estado: EstadoClase.PROGRAMADA,
        creadoEn: AHORA,
        tipoClase: {
            id: 't1',
            nombre: 'Yoga',
            descripcion: 'Posturas',
            activo: true,
            creadoEn: AHORA,
        },
        entrenador: { id: 'e1', nombre: 'Carlos', apellido: 'Martínez' },
        ...datos,
    };
}

const dtoCrear = {
    tipoClaseId: 't1',
    entrenadorId: 'e1',
    fecha: '2026-11-10',
    horaInicio: '07:00',
    horaFin: '08:00',
    cupoMaximo: 20,
};

describe('ClasesService (H4)', () => {
    const repo = {
        findProgramadasDelEntrenadorEntre: vi.fn(),
        findEntre: vi.fn(),
        findById: vi.fn(),
        existeTipoClaseActivo: vi.fn(),
        existeEntrenadorActivo: vi.fn(),
        contarReservasConfirmadas: vi.fn(),
        crearSinTraslape: vi.fn(),
        actualizarSinTraslape: vi.fn(),
    };
    const service = new ClasesService(repo as unknown as ClaseRepository);

    beforeEach(() => {
        vi.resetAllMocks();
        repo.existeTipoClaseActivo.mockResolvedValue(true);
        repo.existeEntrenadorActivo.mockResolvedValue(true);
        repo.contarReservasConfirmadas.mockImplementation((ids: string[]) =>
            Promise.resolve(new Map(ids.map((id) => [id, 0]))),
        );
    });

    describe('listarAgenda', () => {
        it('consulta la semana del lunes al domingo y calcula lugares y estado', async () => {
            const impartida = clase({
                id: 'c0',
                inicio: new Date('2026-11-09T12:00:00Z'),
                fin: new Date('2026-11-09T13:00:00Z'),
            });
            repo.findEntre.mockResolvedValue([impartida, clase()]);
            repo.contarReservasConfirmadas.mockResolvedValue(new Map([['c1', 5]]));

            const agenda = await service.listarAgenda('2026-11-12', AHORA);

            // Lunes 9 a lunes 16 de noviembre, 00:00 en El Salvador (06:00 UTC).
            expect(repo.findEntre).toHaveBeenCalledWith(
                new Date('2026-11-09T06:00:00Z'),
                new Date('2026-11-16T06:00:00Z'),
            );
            expect(agenda[0]).toMatchObject({ id: 'c0', estado: 'IMPARTIDA', lugaresDisponibles: 20 });
            expect(agenda[1]).toMatchObject({
                id: 'c1',
                tipo: { id: 't1', nombre: 'Yoga' },
                entrenador: { id: 'e1', nombre: 'Carlos Martínez' },
                reservasConfirmadas: 5,
                lugaresDisponibles: 15,
                estado: EstadoClase.PROGRAMADA,
            });
        });
    });

    describe('crear', () => {
        it('guarda la clase con las horas convertidas a UTC', async () => {
            repo.crearSinTraslape.mockResolvedValue(clase());

            const creada = await service.crear({ ...dtoCrear, descripcion: '' }, AHORA);

            expect(repo.crearSinTraslape).toHaveBeenCalledWith({
                tipoClaseId: 't1',
                entrenadorId: 'e1',
                descripcion: null,
                inicio: new Date('2026-11-10T13:00:00Z'),
                fin: new Date('2026-11-10T14:00:00Z'),
                cupoMaximo: 20,
            });
            expect(creada).toMatchObject({ id: 'c1', estado: EstadoClase.PROGRAMADA, lugaresDisponibles: 20 });
        });

        it('responde 400 si el horario ya pasó o el fin no es posterior al inicio', async () => {
            await expect(service.crear({ ...dtoCrear, fecha: '2026-11-08' }, AHORA)).rejects.toThrow(
                BadRequestException,
            );
            await expect(service.crear({ ...dtoCrear, horaFin: '07:00' }, AHORA)).rejects.toThrow(
                BadRequestException,
            );
            expect(repo.crearSinTraslape).not.toHaveBeenCalled();
        });

        it('responde 400 si el tipo de clase no existe', async () => {
            repo.existeTipoClaseActivo.mockResolvedValue(false);

            await expect(service.crear(dtoCrear, AHORA)).rejects.toThrow(
                new BadRequestException(MENSAJES_CLASE.tipoInvalido),
            );
        });

        it('responde 400 si el usuario elegido no es un entrenador activo', async () => {
            repo.existeEntrenadorActivo.mockResolvedValue(false);

            await expect(service.crear(dtoCrear, AHORA)).rejects.toThrow(
                new BadRequestException(MENSAJES_CLASE.entrenadorInvalido),
            );
        });

        it('responde 409 si el entrenador ya tiene una actividad en ese horario', async () => {
            repo.crearSinTraslape.mockRejectedValue(new ActividadTraslapadaError());

            await expect(service.crear(dtoCrear, AHORA)).rejects.toThrow(
                new ConflictException(MENSAJES_CLASE.traslape),
            );
        });
    });

    describe('actualizar', () => {
        it('responde 404 si la clase no existe', async () => {
            repo.findById.mockResolvedValue(null);

            await expect(service.actualizar('c1', { cupoMaximo: 10 }, AHORA)).rejects.toThrow(
                new NotFoundException(MENSAJES_CLASE.noExiste),
            );
        });

        it('responde 409 si la clase está cancelada', async () => {
            repo.findById.mockResolvedValue(clase({ estado: EstadoClase.CANCELADA_GIMNASIO }));

            await expect(service.actualizar('c1', { cupoMaximo: 10 }, AHORA)).rejects.toThrow(
                new ConflictException(MENSAJES_CLASE.cancelada),
            );
            expect(repo.actualizarSinTraslape).not.toHaveBeenCalled();
        });

        it('responde 409 si la clase ya empezó', async () => {
            repo.findById.mockResolvedValue(
                clase({ inicio: new Date('2026-11-09T14:30:00Z'), fin: new Date('2026-11-09T15:30:00Z') }),
            );

            await expect(service.actualizar('c1', { cupoMaximo: 10 }, AHORA)).rejects.toThrow(
                new ConflictException(MENSAJES_CLASE.iniciada),
            );
        });

        it('conserva fecha, horas y demás datos que no se envían', async () => {
            repo.findById.mockResolvedValue(clase({ descripcion: 'Nivel básico' }));
            repo.actualizarSinTraslape.mockResolvedValue(clase({ cupoMaximo: 25 }));

            await service.actualizar('c1', { cupoMaximo: 25 }, AHORA);

            expect(repo.actualizarSinTraslape).toHaveBeenCalledWith(
                'c1',
                {
                    tipoClaseId: 't1',
                    entrenadorId: 'e1',
                    descripcion: 'Nivel básico',
                    inicio: new Date('2026-11-10T13:00:00Z'),
                    fin: new Date('2026-11-10T14:00:00Z'),
                    cupoMaximo: 25,
                },
                AHORA,
            );
            expect(repo.existeTipoClaseActivo).not.toHaveBeenCalled();
            expect(repo.existeEntrenadorActivo).not.toHaveBeenCalled();
        });

        it('cambia solo la hora de fin y borra la descripción con ""', async () => {
            repo.findById.mockResolvedValue(clase({ descripcion: 'Nivel básico' }));
            repo.actualizarSinTraslape.mockResolvedValue(clase());

            await service.actualizar('c1', { horaFin: '08:30', descripcion: '' }, AHORA);

            expect(repo.actualizarSinTraslape).toHaveBeenCalledWith(
                'c1',
                expect.objectContaining({
                    descripcion: null,
                    inicio: new Date('2026-11-10T13:00:00Z'),
                    fin: new Date('2026-11-10T14:30:00Z'),
                }),
                AHORA,
            );
        });

        it('valida el entrenador nuevo cuando cambia', async () => {
            repo.findById.mockResolvedValue(clase());
            repo.existeEntrenadorActivo.mockResolvedValue(false);

            await expect(service.actualizar('c1', { entrenadorId: 'e2' }, AHORA)).rejects.toThrow(
                new BadRequestException(MENSAJES_CLASE.entrenadorInvalido),
            );
            expect(repo.existeEntrenadorActivo).toHaveBeenCalledWith('e2');
        });

        it('responde 409 si el cupo nuevo es menor que las reservas confirmadas', async () => {
            repo.findById.mockResolvedValue(clase());
            repo.contarReservasConfirmadas.mockResolvedValue(new Map([['c1', 8]]));

            await expect(service.actualizar('c1', { cupoMaximo: 7 }, AHORA)).rejects.toThrow(
                new ConflictException(MENSAJES_CLASE.cupoMenorQueReservas(8)),
            );
            expect(repo.actualizarSinTraslape).not.toHaveBeenCalled();
        });

        it('permite un cupo igual a las reservas confirmadas', async () => {
            repo.findById.mockResolvedValue(clase());
            repo.contarReservasConfirmadas.mockResolvedValue(new Map([['c1', 8]]));
            repo.actualizarSinTraslape.mockResolvedValue(clase({ cupoMaximo: 8 }));

            const editada = await service.actualizar('c1', { cupoMaximo: 8 }, AHORA);

            expect(editada).toMatchObject({ cupoMaximo: 8, reservasConfirmadas: 8, lugaresDisponibles: 0 });
        });

        it('responde 409 si el nuevo horario choca con otra actividad del entrenador', async () => {
            repo.findById.mockResolvedValue(clase());
            repo.actualizarSinTraslape.mockRejectedValue(new ActividadTraslapadaError());

            await expect(service.actualizar('c1', { horaInicio: '06:30' }, AHORA)).rejects.toThrow(
                new ConflictException(MENSAJES_CLASE.traslape),
            );
        });

        it('responde 409 si la clase se canceló mientras se editaba', async () => {
            repo.findById.mockResolvedValue(clase());
            repo.actualizarSinTraslape.mockRejectedValue(new ClaseNoModificableError());

            await expect(service.actualizar('c1', { cupoMaximo: 10 }, AHORA)).rejects.toThrow(
                new ConflictException(MENSAJES_CLASE.noModificable),
            );
        });
    });
});
