import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common';
import type {
    ActividadConMiembros,
    AsistenciaRepository,
    RegistroParaMarcar,
} from '@Asistencia/repositories';
import {
    MarcaAsistencia,
    MARCAS_REPETIDAS,
    TipoActividad,
} from '@Asistencia/dto';
import { AsistenciaReserva } from '@PrismaClient';
import {
    ACTIVIDAD_DE_OTRO_ENTRENADOR,
    AsistenciaService,
    REGISTRO_NO_EXISTE,
    RESERVA_CANCELADA,
} from './asistencia.service.js';
import { FUERA_DE_VENTANA } from './reglas-asistencia.js';

const ENTRENADOR = 'e1';
const AHORA = new Date('2026-11-18T16:00:00.000Z');
const INICIO = new Date('2026-11-18T14:00:00.000Z');
const FIN = new Date('2026-11-18T15:00:00.000Z');

function registro(datos: Partial<RegistroParaMarcar> = {}): RegistroParaMarcar {
    return {
        registroId: 'r1',
        entrenadorId: ENTRENADOR,
        inicio: INICIO,
        fin: FIN,
        activo: true,
        ...datos,
    };
}

function actividad(datos: Partial<ActividadConMiembros> = {}): ActividadConMiembros {
    return {
        tipo: TipoActividad.CLASE,
        id: 'c1',
        nombre: 'Spinning',
        inicio: INICIO,
        fin: FIN,
        miembros: [
            {
                registroId: 'r1',
                nombre: 'María López',
                codigo: 'MBR-000002',
                asistencia: AsistenciaReserva.SIN_REGISTRAR,
            },
        ],
        ...datos,
    };
}

const MARCA = {
    tipo: TipoActividad.CLASE,
    registroId: 'r1',
    asistencia: MarcaAsistencia.ASISTIO,
};

describe('AsistenciaService', () => {
    const repo = {
        findActividades: vi.fn(),
        findRegistro: vi.fn(),
        marcar: vi.fn(),
    };
    const service = new AsistenciaService(repo as unknown as AsistenciaRepository);

    beforeEach(() => {
        vi.resetAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(AHORA);
        repo.findActividades.mockResolvedValue([actividad()]);
        repo.findRegistro.mockResolvedValue(registro());
        repo.marcar.mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('pendientes', () => {
        it('devuelve cada actividad con sus miembros y las fechas en ISO', async () => {
            const [primera] = await service.pendientes(ENTRENADOR);

            expect(primera).toEqual({
                tipo: TipoActividad.CLASE,
                id: 'c1',
                nombre: 'Spinning',
                inicio: INICIO.toISOString(),
                fin: FIN.toISOString(),
                miembros: [
                    {
                        registroId: 'r1',
                        nombre: 'María López',
                        codigo: 'MBR-000002',
                        asistencia: AsistenciaReserva.SIN_REGISTRAR,
                    },
                ],
            });
        });

        it('pide las actividades del entrenador autenticado y de ahora', async () => {
            await service.pendientes(ENTRENADOR);

            expect(repo.findActividades).toHaveBeenCalledWith(ENTRENADOR, AHORA);
        });

        it('sin actividades devuelve la lista vacía', async () => {
            repo.findActividades.mockResolvedValue([]);

            expect(await service.pendientes(ENTRENADOR)).toEqual([]);
        });
    });

    describe('marcar', () => {
        it('guarda la marca con el entrenador y la fecha y hora', async () => {
            const guardadas = await service.marcar(ENTRENADOR, { marcas: [MARCA] });

            expect(repo.marcar).toHaveBeenCalledWith([MARCA], ENTRENADOR, AHORA);
            expect(guardadas).toEqual([
                {
                    tipo: TipoActividad.CLASE,
                    registroId: 'r1',
                    asistencia: MarcaAsistencia.ASISTIO,
                    registradaEn: AHORA.toISOString(),
                },
            ]);
        });

        it('acepta varias marcas de una vez ("Marcar todos")', async () => {
            repo.findRegistro.mockImplementation(async (_tipo: TipoActividad, id: string) =>
                registro({ registroId: id }),
            );
            const marcas = [
                MARCA,
                { ...MARCA, registroId: 'r2' },
                { ...MARCA, registroId: 'r3', asistencia: MarcaAsistencia.NO_ASISTIO },
            ];

            expect(await service.marcar(ENTRENADOR, { marcas })).toHaveLength(3);
            expect(repo.marcar).toHaveBeenCalledWith(marcas, ENTRENADOR, AHORA);
        });

        it('corrige una marca ya puesta (criterio 3)', async () => {
            repo.findRegistro.mockResolvedValue(registro());

            const [guardada] = await service.marcar(ENTRENADOR, {
                marcas: [{ ...MARCA, asistencia: MarcaAsistencia.NO_ASISTIO }],
            });

            expect(guardada.asistencia).toBe(MarcaAsistencia.NO_ASISTIO);
        });

        it('400 si el mismo registro viene dos veces', async () => {
            await expect(
                service.marcar(ENTRENADOR, { marcas: [MARCA, MARCA] }),
            ).rejects.toThrow(new BadRequestException(MARCAS_REPETIDAS));
            expect(repo.marcar).not.toHaveBeenCalled();
        });

        it('404 si el registro no existe', async () => {
            repo.findRegistro.mockResolvedValue(null);

            await expect(service.marcar(ENTRENADOR, { marcas: [MARCA] })).rejects.toThrow(
                new NotFoundException(REGISTRO_NO_EXISTE),
            );
            expect(repo.marcar).not.toHaveBeenCalled();
        });

        it('403 si la actividad es de otro entrenador (criterio 6)', async () => {
            repo.findRegistro.mockResolvedValue(registro({ entrenadorId: 'otro' }));

            await expect(service.marcar(ENTRENADOR, { marcas: [MARCA] })).rejects.toThrow(
                new ForbiddenException(ACTIVIDAD_DE_OTRO_ENTRENADOR),
            );
            expect(repo.marcar).not.toHaveBeenCalled();
        });

        it('409 si la reserva está cancelada (criterio 6)', async () => {
            repo.findRegistro.mockResolvedValue(registro({ activo: false }));

            await expect(service.marcar(ENTRENADOR, { marcas: [MARCA] })).rejects.toThrow(
                new ConflictException(RESERVA_CANCELADA),
            );
            expect(repo.marcar).not.toHaveBeenCalled();
        });

        it('409 si la actividad todavía no empieza (criterio 5)', async () => {
            vi.setSystemTime(new Date(INICIO.getTime() - 1));

            await expect(service.marcar(ENTRENADOR, { marcas: [MARCA] })).rejects.toThrow(
                new ConflictException(FUERA_DE_VENTANA),
            );
            expect(repo.marcar).not.toHaveBeenCalled();
        });

        it('409 pasadas las 24 horas del fin (criterio 5)', async () => {
            vi.setSystemTime(new Date(FIN.getTime() + 24 * 60 * 60 * 1000 + 60_000));

            await expect(service.marcar(ENTRENADOR, { marcas: [MARCA] })).rejects.toThrow(
                new ConflictException(FUERA_DE_VENTANA),
            );
        });

        it('acepta justo en las 24 horas del fin', async () => {
            vi.setSystemTime(new Date(FIN.getTime() + 24 * 60 * 60 * 1000));

            expect(await service.marcar(ENTRENADOR, { marcas: [MARCA] })).toHaveLength(1);
        });

        it('si una marca del lote falla no se guarda ninguna', async () => {
            repo.findRegistro.mockImplementation(async (_tipo: TipoActividad, id: string) =>
                id === 'r2' ? registro({ registroId: id, entrenadorId: 'otro' }) : registro(),
            );

            await expect(
                service.marcar(ENTRENADOR, {
                    marcas: [MARCA, { ...MARCA, registroId: 'r2' }],
                }),
            ).rejects.toThrow(ForbiddenException);
            expect(repo.marcar).not.toHaveBeenCalled();
        });

        it('revisa la ventana y el entrenador de cada marca, no solo de la primera', async () => {
            repo.findRegistro.mockImplementation(async (_tipo: TipoActividad, id: string) =>
                registro({ registroId: id }),
            );

            await service.marcar(ENTRENADOR, {
                marcas: [MARCA, { ...MARCA, registroId: 'r2' }],
            });

            expect(repo.findRegistro).toHaveBeenCalledTimes(2);
        });

        it('la sesión personal se valida igual que la reserva', async () => {
            repo.findRegistro.mockResolvedValue(registro({ entrenadorId: 'otro' }));

            await expect(
                service.marcar(ENTRENADOR, {
                    marcas: [{ ...MARCA, tipo: TipoActividad.SESION }],
                }),
            ).rejects.toThrow(ForbiddenException);
            expect(repo.findRegistro).toHaveBeenCalledWith(TipoActividad.SESION, 'r1');
        });
    });
});
