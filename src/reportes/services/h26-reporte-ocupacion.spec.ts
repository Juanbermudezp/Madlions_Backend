import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '@Prisma/services';
import type { FilaOcupacion } from '@Reportes/repositories';
import { ReportesController } from '@Reportes/controllers';
import { Rol } from '@PrismaClient';
import { rolesPermitidos } from '../../../test/helpers/roles.js';
import { ReportesRepository } from '../repositories/reportes.repository.js';
import { calcularOcupacion, etiquetaOcupacion } from './reglas-reporte.js';
import { ReportesService } from './reportes.service.js';

const AHORA = new Date('2026-11-18T16:00:00Z'); // miércoles 10:00 en El Salvador

const fila = (datos: Partial<FilaOcupacion> = {}): FilaOcupacion => ({
    tipoClaseId: 't1', tipoClase: 'Yoga', entrenadorId: 'e1', entrenador: 'Carlos Martínez',
    vecesImpartida: 2, reservasConfirmadas: 10, cupoTotal: 20, ...datos,
});

describe('H26. Reporte de ocupación de clases grupales', () => {
    const repo = { ocupacionPorTipoYEntrenador: vi.fn() };
    const service = new ReportesService(repo as unknown as ReportesRepository);

    beforeEach(() => {
        vi.resetAllMocks();
        repo.ocupacionPorTipoYEntrenador.mockResolvedValue([]);
    });

    it('AC1: por tipo y entrenador muestra veces impartida, reservas y ocupación = reservas ÷ cupo × 100 con un decimal', async () => {
        repo.ocupacionPorTipoYEntrenador.mockResolvedValue([fila({ reservasConfirmadas: 7, cupoTotal: 30 })]);

        const { filas } = await service.ocupacion(undefined, undefined, AHORA);

        expect(filas[0]).toMatchObject({
            tipoClase: { id: 't1', nombre: 'Yoga' },
            entrenador: { id: 'e1', nombre: 'Carlos Martínez' },
            vecesImpartida: 2,
            reservasConfirmadas: 7,
            ocupacion: 23.3,
        });
        expect(calcularOcupacion(2, 3)).toBe(66.7);
    });

    it('AC2: solo cuenta clases impartidas (programadas y terminadas) y reservas confirmadas', async () => {
        const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
        await new ReportesRepository(prisma as unknown as PrismaService).ocupacionPorTipoYEntrenador(
            new Date('2026-11-01T06:00:00Z'), new Date('2026-11-19T06:00:00Z'), AHORA,
        );

        const [plantilla, ...parametros] = prisma.$queryRaw.mock.calls[0]!;
        const sql = (plantilla as string[]).join('?');
        expect(sql).toContain("WHERE estado = 'CONFIRMADA'");
        expect(sql).toContain("c.estado = 'PROGRAMADA'");
        expect(sql).toContain('c.fin <= ?');
        expect(sql).not.toMatch(/CANCELADA/);
        expect(parametros[0]).toEqual(AHORA);
    });

    it('AC3: sin rango usa los últimos 30 días, acepta hasta 12 meses y rechaza inicio posterior o rango mayor', async () => {
        await expect(service.ocupacion(undefined, undefined, AHORA)).resolves.toMatchObject({ desde: '2026-10-20', hasta: '2026-11-18' });
        await expect(service.ocupacion('2026-01-01', '2026-12-31', AHORA)).resolves.toMatchObject({ desde: '2026-01-01' });

        await expect(service.ocupacion('2026-11-18', '2026-11-01', AHORA)).rejects.toThrow(
            new BadRequestException('La fecha de inicio no puede ser posterior a la de fin'),
        );
        await expect(service.ocupacion('2025-01-01', '2026-01-01', AHORA)).rejects.toThrow(
            new BadRequestException('El rango máximo es de 12 meses'),
        );
    });

    it('AC4: ordena de mayor a menor ocupación y marca "Baja ocupación" (< 30 %) y "Alta demanda" (≥ 90 %)', async () => {
        repo.ocupacionPorTipoYEntrenador.mockResolvedValue([
            fila({ tipoClase: 'Box', reservasConfirmadas: 5, cupoTotal: 20 }), // 25 %
            fila({ tipoClase: 'Spinning', reservasConfirmadas: 18, cupoTotal: 20 }), // 90 %
            fila({ tipoClase: 'Yoga', reservasConfirmadas: 10, cupoTotal: 20 }), // 50 %
        ]);

        const { filas } = await service.ocupacion(undefined, undefined, AHORA);

        expect(filas.map((f) => [f.tipoClase.nombre, f.ocupacion, f.etiqueta])).toEqual([
            ['Spinning', 90, 'ALTA'],
            ['Yoga', 50, null],
            ['Box', 25, 'BAJA'],
        ]);
        expect(etiquetaOcupacion(29.9)).toBe('BAJA');
        expect(etiquetaOcupacion(30)).toBeNull();
    });

    it('AC5: sin clases impartidas en el período devuelve el reporte sin filas', async () => {
        await expect(service.ocupacion('2026-11-01', '2026-11-18', AHORA)).resolves.toEqual({
            desde: '2026-11-01', hasta: '2026-11-18', filas: [],
        });
    });

    it('AC6: el reporte trae el rango de fechas y la tabla que van en el PDF', async () => {
        repo.ocupacionPorTipoYEntrenador.mockResolvedValue([fila()]);

        const reporte = await service.ocupacion('2026-11-01', '2026-11-18', AHORA);

        expect(reporte).toMatchObject({ desde: '2026-11-01', hasta: '2026-11-18' });
        expect(reporte.filas).toHaveLength(1);
    });

    it('AC7: miembro, entrenador y recepción no pueden abrir el reporte', () => {
        expect(rolesPermitidos(ReportesController, 'ocupacion')).toEqual([Rol.ADMINISTRADOR]);
    });
});
