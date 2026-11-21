import { BadRequestException } from '@nestjs/common';
import type { CalificacionesRepository } from '@Estadisticas/repositories';
import { EstadisticasService } from './estadisticas.service.js';

const AHORA = new Date('2026-11-20T18:00:00.000Z');

/** [desde 00:00, hasta + 1 día 00:00) en hora de El Salvador (UTC-6). */
function instantes(desde: string, hastaMasUno: string) {
    return [new Date(`${desde}T06:00:00.000Z`), new Date(`${hastaMasUno}T06:00:00.000Z`)];
}

describe('EstadisticasService', () => {
    const repo = {
        porEntrenador: vi.fn(),
        porTipoClase: vi.fn(),
        instalaciones: vi.fn(),
    };
    const service = new EstadisticasService(repo as unknown as CalificacionesRepository);

    beforeEach(() => {
        vi.resetAllMocks();
        repo.porEntrenador.mockResolvedValue([
            { id: 'e1', nombre: 'Carlos Martínez', promedio: 4.5, total: 4 },
            { id: 'e2', nombre: 'Ana Hernández', promedio: 5, total: 2 },
            { id: 'e3', nombre: 'Sin Reseñas', promedio: null, total: 0 },
        ]);
        repo.porTipoClase.mockResolvedValue([
            { id: 't1', nombre: 'Spinning', promedio: 10 / 3, total: 3 },
        ]);
        repo.instalaciones.mockResolvedValue({ promedio: 4.26, total: 7 });
    });

    describe('rango de fechas', () => {
        it('sin fechas usa los últimos 30 días', async () => {
            const res = await service.calificaciones(undefined, undefined, AHORA);

            expect(res.desde).toBe('2026-10-22');
            expect(res.hasta).toBe('2026-11-20');
        });

        it('convierte los días de El Salvador a instantes UTC', async () => {
            await service.calificaciones('2026-11-01', '2026-11-30', AHORA);

            const [inicio, fin] = instantes('2026-11-01', '2026-12-01');
            expect(repo.porEntrenador).toHaveBeenCalledWith(inicio, fin);
            expect(repo.porTipoClase).toHaveBeenCalledWith(inicio, fin);
            expect(repo.instalaciones).toHaveBeenCalledWith(inicio, fin);
        });

        it('devuelve el rango que usó', async () => {
            const res = await service.calificaciones('2026-11-01', '2026-11-30', AHORA);

            expect(res).toMatchObject({ desde: '2026-11-01', hasta: '2026-11-30' });
        });

        it('400 si el inicio es posterior al fin (criterio 4)', async () => {
            await expect(
                service.calificaciones('2026-11-30', '2026-11-01', AHORA),
            ).rejects.toThrow(
                new BadRequestException('La fecha de inicio no puede ser posterior a la de fin'),
            );
            expect(repo.porEntrenador).not.toHaveBeenCalled();
        });

        it('400 si una fecha no existe en el calendario', async () => {
            await expect(
                service.calificaciones('2026-02-30', undefined, AHORA),
            ).rejects.toThrow(BadRequestException);
        });

        it('un rango de un solo día es válido', async () => {
            const res = await service.calificaciones('2026-11-20', '2026-11-20', AHORA);

            expect(res.desde).toBe('2026-11-20');
            const [inicio, fin] = instantes('2026-11-20', '2026-11-21');
            expect(repo.instalaciones).toHaveBeenCalledWith(inicio, fin);
        });
    });

    describe('promedios', () => {
        it('publica el promedio del entrenador con 3 reseñas o más', async () => {
            const { entrenadores } = await service.calificaciones(undefined, undefined, AHORA);

            expect(entrenadores[0]).toEqual({
                id: 'e1',
                nombre: 'Carlos Martínez',
                promedio: 4.5,
                total: 4,
            });
        });

        it('con 2 reseñas deja el promedio en null pero conserva el total', async () => {
            const { entrenadores } = await service.calificaciones(undefined, undefined, AHORA);

            expect(entrenadores[1]).toEqual({
                id: 'e2',
                nombre: 'Ana Hernández',
                promedio: null,
                total: 2,
            });
        });

        it('un entrenador sin reseñas igual aparece, en 0', async () => {
            const { entrenadores } = await service.calificaciones(undefined, undefined, AHORA);

            expect(entrenadores[2]).toEqual({
                id: 'e3',
                nombre: 'Sin Reseñas',
                promedio: null,
                total: 0,
            });
        });

        it('redondea a un decimal el promedio del tipo de clase', async () => {
            const { tiposClase } = await service.calificaciones(undefined, undefined, AHORA);

            expect(tiposClase[0]).toEqual({
                id: 't1',
                nombre: 'Spinning',
                promedio: 3.3,
                total: 3,
            });
        });

        it('las instalaciones se redondean igual', async () => {
            const { instalaciones } = await service.calificaciones(undefined, undefined, AHORA);

            expect(instalaciones).toEqual({ promedio: 4.3, total: 7 });
        });

        it('las instalaciones con menos de 3 reseñas quedan sin promedio', async () => {
            repo.instalaciones.mockResolvedValue({ promedio: 5, total: 2 });

            const { instalaciones } = await service.calificaciones(undefined, undefined, AHORA);

            expect(instalaciones).toEqual({ promedio: null, total: 2 });
        });

        it('sin ninguna reseña devuelve las listas con todo en cero', async () => {
            repo.porEntrenador.mockResolvedValue([]);
            repo.porTipoClase.mockResolvedValue([]);
            repo.instalaciones.mockResolvedValue({ promedio: null, total: 0 });

            const res = await service.calificaciones(undefined, undefined, AHORA);

            expect(res.entrenadores).toEqual([]);
            expect(res.tiposClase).toEqual([]);
            expect(res.instalaciones).toEqual({ promedio: null, total: 0 });
        });
    });
});
