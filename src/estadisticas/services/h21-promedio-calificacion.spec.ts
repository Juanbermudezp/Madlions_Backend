import { BadRequestException } from '@nestjs/common';
import { Rol } from '@PrismaClient';
import type { CalificacionesRepository } from '@Estadisticas/repositories';
import { rolesPermitidos } from '../../../test/helpers/roles.js';
import { EstadisticasController } from '../controllers/estadisticas.controller.js';
import { EstadisticasService } from './estadisticas.service.js';

const AHORA = new Date('2026-11-21T18:00:00Z'); // 21/11 en El Salvador
const agregado = (id: string, promedio: number | null, total: number) => ({ id, nombre: `Nombre ${id}`, promedio, total });

describe('H21. Promedio de calificación por entrenador y por clase', () => {
    const repo = { porEntrenador: vi.fn(), porTipoClase: vi.fn(), instalaciones: vi.fn() };
    const service = new EstadisticasService(repo as unknown as CalificacionesRepository);

    beforeEach(() => {
        vi.resetAllMocks();
        repo.porEntrenador.mockResolvedValue([agregado('e1', 4.25, 4), agregado('e2', 3.6667, 3)]);
        repo.porTipoClase.mockResolvedValue([agregado('t1', 4.8333, 6)]);
        repo.instalaciones.mockResolvedValue({ promedio: 3.95, total: 10 });
    });

    it('AC1: muestra el promedio con un decimal y el total de reseñas por entrenador, por tipo de clase y de instalaciones', async () => {
        const res = await service.calificaciones('2026-11-01', '2026-11-20', AHORA);

        expect(res.entrenadores).toEqual([
            { id: 'e1', nombre: 'Nombre e1', promedio: 4.3, total: 4 }, { id: 'e2', nombre: 'Nombre e2', promedio: 3.7, total: 3 },
        ]);
        expect(res.tiposClase[0]).toMatchObject({ promedio: 4.8, total: 6 });
        expect(res.instalaciones).toEqual({ promedio: 4, total: 10 });
    });

    it('AC2: sin rango usa los últimos 30 días y con otro rango se recalcula', async () => {
        const porDefecto = await service.calificaciones(undefined, undefined, AHORA);
        expect(porDefecto).toMatchObject({ desde: '2026-10-23', hasta: '2026-11-21' });
        expect(repo.porEntrenador).toHaveBeenLastCalledWith(new Date('2026-10-23T06:00:00Z'), new Date('2026-11-22T06:00:00Z'));

        await service.calificaciones('2026-09-01', '2026-09-30', AHORA);
        expect(repo.porEntrenador).toHaveBeenLastCalledWith(new Date('2026-09-01T06:00:00Z'), new Date('2026-10-01T06:00:00Z'));
    });

    it('AC3: con menos de 3 reseñas no se publica el promedio ("Sin datos suficientes")', async () => {
        repo.porEntrenador.mockResolvedValue([agregado('e1', 5, 2), agregado('e2', 4, 3)]);
        repo.instalaciones.mockResolvedValue({ promedio: 2, total: 1 });

        const res = await service.calificaciones('2026-11-01', '2026-11-20', AHORA);

        expect(res.entrenadores.map((e) => e.promedio)).toEqual([null, 4]);
        expect(res.instalaciones.promedio).toBeNull();
    });

    it('AC4: una fecha de inicio posterior a la de fin se rechaza', async () => {
        await expect(service.calificaciones('2026-11-20', '2026-11-01', AHORA)).rejects.toThrow(
            new BadRequestException('La fecha de inicio no puede ser posterior a la de fin'),
        );
        expect(repo.porEntrenador).not.toHaveBeenCalled();
    });

    it('AC5: solo el administrador abre el panel ("Acceso denegado" para los demás)', () => {
        expect(rolesPermitidos(EstadisticasController, 'calificaciones')).toEqual([Rol.ADMINISTRADOR]);
    });
});
