import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common';
import type {
    PendientePorCalificar,
    RegistroParaCalificar,
    ResenaRepository,
} from '@Resenas/repositories';
import { TipoActividad } from '@Resenas/dto';
import type { Resena } from '@PrismaClient';
import {
    FUERA_DE_PLAZO,
    REGISTRO_DE_OTRO_MIEMBRO,
    REGISTRO_NO_EXISTE,
    ResenasService,
    SIN_ASISTENCIA,
    SIN_FICHA_DE_MIEMBRO,
    YA_CALIFICADA,
} from './resenas.service.js';
import { CALIFICA_AL_MENOS_UN_ASPECTO } from './reglas-resena.js';

const USUARIO = 'u1';
const MIEMBRO = 'm1';
const AHORA = new Date('2026-11-18T12:00:00.000Z');
const FIN = new Date('2026-11-17T15:00:00.000Z');
const DIA = 24 * 60 * 60 * 1000;

function registro(datos: Partial<RegistroParaCalificar> = {}): RegistroParaCalificar {
    return {
        registroId: 'r1',
        miembroId: MIEMBRO,
        entrenadorId: 'e1',
        tipoClaseId: 't1',
        fin: FIN,
        asistio: true,
        yaCalificada: false,
        ...datos,
    };
}

function pendiente(datos: Partial<PendientePorCalificar> = {}): PendientePorCalificar {
    return {
        tipo: TipoActividad.CLASE,
        registroId: 'r1',
        nombre: 'Spinning',
        entrenador: 'Carlos Martínez',
        fin: FIN,
        ...datos,
    };
}

function resenaGuardada(): Resena {
    return {
        id: 'res1',
        miembroId: MIEMBRO,
        reservaId: 'r1',
        sesionId: null,
        entrenadorId: 'e1',
        tipoClaseId: 't1',
        calActividad: 5,
        calEntrenador: 4,
        calInstalaciones: null,
        comentario: 'La clase estuvo muy buena.',
        creadaEn: AHORA,
    };
}

const DATOS = {
    tipo: TipoActividad.CLASE,
    registroId: 'r1',
    calActividad: 5,
    calEntrenador: 4,
};

describe('ResenasService', () => {
    const repo = {
        findMiembroIdDeUsuario: vi.fn(),
        findPendientes: vi.fn(),
        findRegistro: vi.fn(),
        crear: vi.fn(),
    };
    const service = new ResenasService(repo as unknown as ResenaRepository);

    beforeEach(() => {
        vi.resetAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(AHORA);
        repo.findMiembroIdDeUsuario.mockResolvedValue(MIEMBRO);
        repo.findPendientes.mockResolvedValue([pendiente()]);
        repo.findRegistro.mockResolvedValue(registro());
        repo.crear.mockResolvedValue(resenaGuardada());
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('pendientes', () => {
        it('devuelve cada pendiente con su fecha límite a 7 días del fin', async () => {
            const [primero] = await service.pendientes(USUARIO);

            expect(primero).toEqual({
                tipo: TipoActividad.CLASE,
                registroId: 'r1',
                nombre: 'Spinning',
                entrenador: 'Carlos Martínez',
                fin: FIN.toISOString(),
                fechaLimite: new Date(FIN.getTime() + 7 * DIA).toISOString(),
            });
        });

        it('busca los pendientes del miembro del usuario autenticado', async () => {
            await service.pendientes(USUARIO);

            expect(repo.findPendientes).toHaveBeenCalledWith(MIEMBRO, AHORA);
        });

        it('sin pendientes devuelve la lista vacía', async () => {
            repo.findPendientes.mockResolvedValue([]);

            expect(await service.pendientes(USUARIO)).toEqual([]);
        });

        it('403 si el usuario no tiene ficha de miembro', async () => {
            repo.findMiembroIdDeUsuario.mockResolvedValue(null);

            await expect(service.pendientes(USUARIO)).rejects.toThrow(
                new ForbiddenException(SIN_FICHA_DE_MIEMBRO),
            );
        });
    });

    describe('crear', () => {
        it('guarda la reseña con el entrenador y el tipo de clase del registro', async () => {
            await service.crear(USUARIO, DATOS);

            expect(repo.crear).toHaveBeenCalledWith({
                tipo: TipoActividad.CLASE,
                registroId: 'r1',
                miembroId: MIEMBRO,
                entrenadorId: 'e1',
                tipoClaseId: 't1',
                calActividad: 5,
                calEntrenador: 4,
                calInstalaciones: undefined,
                comentario: undefined,
            });
        });

        it('el cliente no puede imponer el entrenador ni el tipo de clase', async () => {
            repo.findRegistro.mockResolvedValue(registro({ entrenadorId: 'real', tipoClaseId: 'tr' }));

            await service.crear(USUARIO, {
                ...DATOS,
                // Campos que no son del contrato; si llegaran, se ignoran.
                ...({ entrenadorId: 'falso', tipoClaseId: 'falso' } as object),
            });

            expect(repo.crear).toHaveBeenCalledWith(
                expect.objectContaining({ entrenadorId: 'real', tipoClaseId: 'tr' }),
            );
        });

        it('una sesión personal se guarda sin tipo de clase', async () => {
            repo.findRegistro.mockResolvedValue(registro({ tipoClaseId: null }));

            await service.crear(USUARIO, { ...DATOS, tipo: TipoActividad.SESION });

            expect(repo.crear).toHaveBeenCalledWith(
                expect.objectContaining({ tipo: TipoActividad.SESION, tipoClaseId: null }),
            );
        });

        it('devuelve la reseña guardada', async () => {
            expect(await service.crear(USUARIO, DATOS)).toMatchObject({
                id: 'res1',
                tipo: TipoActividad.CLASE,
                registroId: 'r1',
                calActividad: 5,
                calInstalaciones: null,
            });
        });

        it('400 si no viene ninguna calificación (criterio 4)', async () => {
            await expect(
                service.crear(USUARIO, { tipo: TipoActividad.CLASE, registroId: 'r1' }),
            ).rejects.toThrow(new BadRequestException(CALIFICA_AL_MENOS_UN_ASPECTO));
            expect(repo.crear).not.toHaveBeenCalled();
        });

        it('404 si el registro no existe', async () => {
            repo.findRegistro.mockResolvedValue(null);

            await expect(service.crear(USUARIO, DATOS)).rejects.toThrow(
                new NotFoundException(REGISTRO_NO_EXISTE),
            );
        });

        it('403 si el registro es de otro miembro', async () => {
            repo.findRegistro.mockResolvedValue(registro({ miembroId: 'otro' }));

            await expect(service.crear(USUARIO, DATOS)).rejects.toThrow(
                new ForbiddenException(REGISTRO_DE_OTRO_MIEMBRO),
            );
            expect(repo.crear).not.toHaveBeenCalled();
        });

        it('409 si no tiene la asistencia registrada (criterio 5)', async () => {
            repo.findRegistro.mockResolvedValue(registro({ asistio: false }));

            await expect(service.crear(USUARIO, DATOS)).rejects.toThrow(
                new ConflictException(SIN_ASISTENCIA),
            );
        });

        it('409 si ya la calificó (criterio 5)', async () => {
            repo.findRegistro.mockResolvedValue(registro({ yaCalificada: true }));

            await expect(service.crear(USUARIO, DATOS)).rejects.toThrow(
                new ConflictException(YA_CALIFICADA),
            );
        });

        it('409 si terminó hace más de 7 días (criterio 5)', async () => {
            repo.findRegistro.mockResolvedValue(
                registro({ fin: new Date(AHORA.getTime() - 8 * DIA) }),
            );

            await expect(service.crear(USUARIO, DATOS)).rejects.toThrow(
                new ConflictException(FUERA_DE_PLAZO),
            );
            expect(repo.crear).not.toHaveBeenCalled();
        });

        it('acepta justo en el límite de los 7 días', async () => {
            repo.findRegistro.mockResolvedValue(
                registro({ fin: new Date(AHORA.getTime() - 7 * DIA) }),
            );

            await service.crear(USUARIO, DATOS);

            expect(repo.crear).toHaveBeenCalled();
        });

        it('403 si el usuario no tiene ficha de miembro', async () => {
            repo.findMiembroIdDeUsuario.mockResolvedValue(null);

            await expect(service.crear(USUARIO, DATOS)).rejects.toThrow(
                new ForbiddenException(SIN_FICHA_DE_MIEMBRO),
            );
        });
    });
});
