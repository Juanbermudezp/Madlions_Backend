import { BadRequestException } from '@nestjs/common';
import type { FilaOcupacion, ReportesRepository } from '@Reportes/repositories';
import { MENSAJES_REPORTE } from './reglas-reporte.js';
import { ReportesService } from './reportes.service.js';

const AHORA = new Date('2026-11-18T16:00:00Z');

const fila = (datos: Partial<FilaOcupacion>): FilaOcupacion => ({
    tipoClaseId: 't1', tipoClase: 'Yoga', entrenadorId: 'e1', entrenador: 'Carlos Martínez',
    vecesImpartida: 2, reservasConfirmadas: 10, cupoTotal: 20, ...datos,
});

describe('ReportesService.ocupacion (BE-26.1)', () => {
    const repo = { ocupacionPorTipoYEntrenador: vi.fn() };
    const service = new ReportesService(repo as unknown as ReportesRepository);

    beforeEach(() => vi.resetAllMocks());

    it('consulta los últimos 30 días en hora de El Salvador por defecto', async () => {
        repo.ocupacionPorTipoYEntrenador.mockResolvedValue([]);
        const res = await service.ocupacion(undefined, undefined, AHORA);

        expect(res).toEqual({ desde: '2026-10-20', hasta: '2026-11-18', filas: [] });
        expect(repo.ocupacionPorTipoYEntrenador).toHaveBeenCalledWith(
            new Date('2026-10-20T06:00:00Z'), // 20/10 00:00 local
            new Date('2026-11-19T06:00:00Z'), // 19/11 00:00 local (el 18 completo incluido)
            AHORA,
        );
    });

    it('calcula ocupación y etiqueta, y ordena de mayor a menor', async () => {
        repo.ocupacionPorTipoYEntrenador.mockResolvedValue([
            fila({ tipoClase: 'Box', reservasConfirmadas: 4, cupoTotal: 20 }), // 20 %
            fila({ tipoClase: 'Spinning', reservasConfirmadas: 19, cupoTotal: 20 }), // 95 %
            fila({ tipoClase: 'Yoga', reservasConfirmadas: 10, cupoTotal: 20 }), // 50 %
        ]);

        const { filas } = await service.ocupacion('2026-11-01', '2026-11-18', AHORA);

        expect(filas.map((f) => [f.tipoClase.nombre, f.ocupacion, f.etiqueta])).toEqual([
            ['Spinning', 95, 'ALTA'],
            ['Yoga', 50, null],
            ['Box', 20, 'BAJA'],
        ]);
        expect(filas[0]).toMatchObject({ entrenador: { id: 'e1', nombre: 'Carlos Martínez' }, vecesImpartida: 2, cupoTotal: 20 });
    });

    it('empates: mismo porcentaje, ordena por tipo y entrenador', async () => {
        repo.ocupacionPorTipoYEntrenador.mockResolvedValue([
            fila({ tipoClase: 'Yoga', entrenador: 'Zoe' }),
            fila({ tipoClase: 'Yoga', entrenador: 'Ana' }),
            fila({ tipoClase: 'Box' }),
        ]);
        const { filas } = await service.ocupacion(undefined, undefined, AHORA);
        expect(filas.map((f) => `${f.tipoClase.nombre}-${f.entrenador.nombre}`)).toEqual([
            'Box-Carlos Martínez', 'Yoga-Ana', 'Yoga-Zoe',
        ]);
    });

    it.each([
        ['2026-11-10', '2026-11-09', MENSAJES_REPORTE.inicioPosterior],
        ['2025-01-01', '2026-01-01', MENSAJES_REPORTE.rangoMaximo],
    ])('rechaza %s a %s con 400', async (desde, hasta, mensaje) => {
        await expect(service.ocupacion(desde, hasta, AHORA)).rejects.toThrow(new BadRequestException(mensaje));
        expect(repo.ocupacionPorTipoYEntrenador).not.toHaveBeenCalled();
    });
});
