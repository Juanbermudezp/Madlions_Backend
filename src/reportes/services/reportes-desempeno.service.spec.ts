import { BadRequestException } from '@nestjs/common';
import type { ReportesDesempenoRepository, ReportesRepository } from '@Reportes/repositories';
import { Rol } from '@PrismaClient';
import { MENSAJES_REPORTE } from './reglas-reporte.js';
import { ReportesDesempenoService } from './reportes-desempeno.service.js';
import { ReportesService } from './reportes.service.js';

// 20/11/2026 a las 22:00 en El Salvador = 21/11/2026 04:00 UTC.
const AHORA = new Date('2026-11-21T04:00:00.000Z');
const ADMIN = { id: 'u-admin', rol: Rol.ADMINISTRADOR };
const ENTRENADOR = { id: 'e-ana', rol: Rol.ENTRENADOR };

describe('ReportesDesempenoService', () => {
    const reportesRepository = { ocupacionPorTipoYEntrenador: vi.fn() };
    const repo = { entrenadores: vi.fn(), sesionesRealizadas: vi.fn(), resenas: vi.fn() };
    const service = new ReportesDesempenoService(
        new ReportesService(reportesRepository as unknown as ReportesRepository),
        reportesRepository as unknown as ReportesRepository,
        repo as unknown as ReportesDesempenoRepository,
    );

    beforeEach(() => {
        vi.resetAllMocks();
        reportesRepository.ocupacionPorTipoYEntrenador.mockResolvedValue([]);
        repo.entrenadores.mockResolvedValue([{ id: 'e-ana', nombre: 'Ana López' }]);
        repo.sesionesRealizadas.mockResolvedValue(new Map());
        repo.resenas.mockResolvedValue(new Map());
    });

    it('sin fechas usa los últimos 30 días en hora de El Salvador (igual que H26)', async () => {
        const resultado = await service.desempeno(ADMIN, {}, AHORA);

        expect(resultado).toMatchObject({ desde: '2026-10-22', hasta: '2026-11-20' });
        const desde = new Date('2026-10-22T06:00:00.000Z');
        const hasta = new Date('2026-11-21T06:00:00.000Z');
        expect(reportesRepository.ocupacionPorTipoYEntrenador).toHaveBeenCalledWith(desde, hasta, AHORA);
        expect(repo.sesionesRealizadas).toHaveBeenCalledWith(desde, hasta, AHORA);
        expect(repo.resenas).toHaveBeenCalledWith(desde, hasta);
    });

    it('el administrador ve a todos los entrenadores', async () => {
        await service.desempeno(ADMIN, {}, AHORA);

        expect(repo.entrenadores).toHaveBeenCalledWith(undefined);
    });

    it('el administrador puede filtrar por entrenadorId', async () => {
        await service.desempeno(ADMIN, { entrenadorId: 'e-luis' }, AHORA);

        expect(repo.entrenadores).toHaveBeenCalledWith('e-luis');
    });

    it('un entrenador solo recibe sus datos aunque pida los de otro', async () => {
        await service.desempeno(ENTRENADOR, { entrenadorId: 'e-luis' }, AHORA);

        expect(repo.entrenadores).toHaveBeenCalledWith('e-ana');
    });

    it.each([
        ['2026-11-10', '2026-11-01', MENSAJES_REPORTE.inicioPosterior],
        ['2026-01-01', '2027-01-01', MENSAJES_REPORTE.rangoMaximo],
        ['2026-02-30', undefined, MENSAJES_REPORTE.fechaInvalida],
    ])('rechaza %s a %s con 400 antes de consultar', async (desde, hasta, mensaje) => {
        await expect(service.desempeno(ADMIN, { desde, hasta }, AHORA)).rejects.toThrow(
            new BadRequestException(mensaje),
        );
        expect(repo.entrenadores).not.toHaveBeenCalled();
    });
});
