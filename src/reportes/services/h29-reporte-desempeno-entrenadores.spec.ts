import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '@Prisma/services';
import { Rol } from '@PrismaClient';
import { ReportesDesempenoRepository, ReportesRepository, type FilaOcupacion } from '@Reportes/repositories';
import { rolesPermitidos } from '../../../test/helpers/roles.js';
import { ReportesController } from '../controllers/reportes.controller.js';
import { ReportesDesempenoService } from './reportes-desempeno.service.js';
import { ReportesService } from './reportes.service.js';

const AHORA = new Date('2026-11-21T04:00:00Z'); // 20/11 a las 22:00 en El Salvador
const ADMIN = { id: 'u-admin', rol: Rol.ADMINISTRADOR };
const ocupacion = (entrenadorId: string, vecesImpartida: number, reservasConfirmadas: number, cupoTotal: number): FilaOcupacion =>
    ({ tipoClaseId: 't1', tipoClase: 'Yoga', entrenadorId, entrenador: entrenadorId, vecesImpartida, reservasConfirmadas, cupoTotal });

describe('H29. Reporte de desempeño de entrenadores', () => {
    const reportesRepository = { ocupacionPorTipoYEntrenador: vi.fn() };
    const repo = { entrenadores: vi.fn(), sesionesRealizadas: vi.fn(), resenas: vi.fn() };
    const service = new ReportesDesempenoService(new ReportesService(reportesRepository as unknown as ReportesRepository),
        reportesRepository as unknown as ReportesRepository, repo as unknown as ReportesDesempenoRepository);

    beforeEach(() => {
        vi.resetAllMocks();
        repo.entrenadores.mockResolvedValue([{ id: 'e1', nombre: 'Ana López' }, { id: 'e2', nombre: 'Luis Gómez' }]);
        reportesRepository.ocupacionPorTipoYEntrenador.mockResolvedValue([ocupacion('e1', 2, 15, 20), ocupacion('e1', 1, 5, 10)]);
        repo.sesionesRealizadas.mockResolvedValue(new Map([['e1', 4]]));
        repo.resenas.mockResolvedValue(new Map([['e1', { entrenadorId: 'e1', promedio: 4.36, total: 5 }], ['e2', { entrenadorId: 'e2', promedio: 5, total: 2 }]]));
    });

    it('AC1: por entrenador muestra clases impartidas, ocupación promedio (fórmula de H26), sesiones realizadas, calificación y reseñas', async () => {
        const { filas } = await service.desempeno(ADMIN, { desde: '2026-11-01', hasta: '2026-11-20' }, AHORA);

        expect(filas[0]).toEqual({ entrenador: { id: 'e1', nombre: 'Ana López' }, clasesImpartidas: 3, ocupacionPromedio: 66.7, sesionesRealizadas: 4, calificacion: 4.4, resenas: 5 });
        expect(filas[1]).toMatchObject({ clasesImpartidas: 0, ocupacionPromedio: null, sesionesRealizadas: 0 });
    });

    it('AC2: clase impartida = "Programada" con fin pasado; sesión realizada = fin pasado y asistencia "Asistió"', async () => {
        const prisma = { $queryRaw: vi.fn().mockResolvedValue([]), sesionPersonal: { groupBy: vi.fn().mockResolvedValue([]) } };
        await new ReportesRepository(prisma as unknown as PrismaService).ocupacionPorTipoYEntrenador(new Date(), new Date(), AHORA);
        const sql = (prisma.$queryRaw.mock.calls[0]![0] as string[]).join('?');
        expect(sql).toContain("c.estado = 'PROGRAMADA'");
        expect(sql).toContain('c.fin <= ?');

        await new ReportesDesempenoRepository(prisma as unknown as PrismaService).sesionesRealizadas(new Date(), new Date(), AHORA);
        expect(prisma.sesionPersonal.groupBy.mock.calls[0][0].where).toMatchObject({ fin: { lte: AHORA }, asistencia: 'ASISTIO' });
    });

    it('AC3: con menos de 3 reseñas la calificación queda como "Sin datos suficientes"', async () => {
        const { filas } = await service.desempeno(ADMIN, {}, AHORA);

        expect(filas[1]).toMatchObject({ calificacion: null, resenas: 2 });
    });

    it('AC4: aplica el rango de H26 (rechaza inicio posterior al fin) y entrega los campos por los que se ordena la tabla', async () => {
        await expect(service.desempeno(ADMIN, { desde: '2026-11-20', hasta: '2026-11-01' }, AHORA)).rejects.toBeInstanceOf(BadRequestException);

        const { filas } = await service.desempeno(ADMIN, { desde: '2026-11-01', hasta: '2026-11-20' }, AHORA);
        for (const fila of filas) expect(Object.keys(fila)).toEqual(expect.arrayContaining(['calificacion', 'ocupacionPromedio', 'clasesImpartidas']));
    });

    it('AC5: el entrenador solo ve sus propias métricas aunque pida las de otro', async () => {
        await service.desempeno({ id: 'e1', rol: Rol.ENTRENADOR }, { entrenadorId: 'e2' }, AHORA);
        expect(repo.entrenadores).toHaveBeenCalledWith('e1');

        await service.desempeno(ADMIN, { entrenadorId: 'e2' }, AHORA);
        expect(repo.entrenadores).toHaveBeenLastCalledWith('e2');
    });

    it('AC6: miembro y recepción no abren el reporte ("Acceso denegado")', () => {
        expect(rolesPermitidos(ReportesController, 'desempeno').sort()).toEqual([Rol.ADMINISTRADOR, Rol.ENTRENADOR]);
    });
});
