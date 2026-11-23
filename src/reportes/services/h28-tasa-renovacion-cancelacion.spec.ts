import type { PrismaService } from '@Prisma/services';
import { Rol } from '@PrismaClient';
import { rolesPermitidos } from '../../../test/helpers/roles.js';
import { ReportesController } from '../controllers/reportes.controller.js';
import { ReportesRepository, type FilaRenovacion } from '../repositories/reportes.repository.js';
import { ReportesService } from './reportes.service.js';

const AHORA = new Date('2026-11-21T18:00:00Z'); // hoy 21/11 en El Salvador
const fila = (id: string, fechaVencimiento: string, renovada: boolean): FilaRenovacion =>
    ({ id, nombre: `Miembro ${id}`, codigo: `MBR-00000${id}`, plan: 'Mensual', fechaVencimiento, renovada });

describe('H28. Tasa de renovación y cancelación de membresías', () => {
    const repo = { renovacion: vi.fn() };
    const service = new ReportesService(repo as unknown as ReportesRepository);
    const sqlRenovacion = async () => {
        const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
        await new ReportesRepository(prisma as unknown as PrismaService).renovacion('2026-11-01', '2026-11-20', AHORA);
        return (prisma.$queryRaw.mock.calls[0]![0] as string[]).join('?');
    };

    beforeEach(() => {
        vi.resetAllMocks();
        repo.renovacion.mockResolvedValue([]);
    });

    it('AC1: considera Mensual y Set de clases con vencimiento en el rango; los Daypass no se incluyen', async () => {
        const sql = await sqlRenovacion();
        expect(sql).toContain("m.tipo_plan IN ('MENSUAL', 'SET_CLASES')");
        expect(sql).toContain('m.fecha_vencimiento >= ?::date AND m.fecha_vencimiento <= ?::date');
    });

    it('AC2: cuenta como renovada si el cobro de renovación quedó "Pagado" entre el vencimiento y los 7 días siguientes', async () => {
        const sql = await sqlRenovacion();
        expect(sql).toContain("cr.concepto = 'RENOVACION' AND cr.estado = 'PAGADO'");
        expect(sql).toContain("cr.pagado_en >= m.fecha_vencimiento::timestamp + INTERVAL '6 hours'");
        expect(sql).toContain("cr.pagado_en < (m.fecha_vencimiento + 8)::timestamp + INTERVAL '6 hours'");

        repo.renovacion.mockResolvedValue([fila('1', '2026-11-01', true), fila('2', '2026-11-01', false)]);
        expect(await service.renovacion('2026-11-01', '2026-11-20', AHORA)).toMatchObject({ renovadas: 1, canceladas: 1 });
    });

    it('AC3: una membresía vencida hace menos de 7 días y sin renovar queda "En período de renovación" fuera de ambos cálculos', async () => {
        repo.renovacion.mockResolvedValue([fila('1', '2026-11-14', false), fila('2', '2026-11-13', false), fila('3', '2026-11-10', true)]);

        const res = await service.renovacion('2026-11-01', '2026-11-20', AHORA);

        expect(res).toMatchObject({ enPeriodo: 1, renovadas: 1, canceladas: 1, tasaRenovacion: 50 });
    });

    it('AC4: las tasas usan renovadas + canceladas, tienen un decimal y suman 100 %', async () => {
        repo.renovacion.mockResolvedValue([fila('1', '2026-11-01', true), fila('2', '2026-11-02', false), fila('3', '2026-11-03', false)]);

        const res = await service.renovacion('2026-11-01', '2026-11-20', AHORA);

        expect(res.tasaRenovacion).toBe(33.3);
        expect(res.tasaCancelacion).toBe(66.7);
        expect(res.tasaRenovacion! + res.tasaCancelacion!).toBeCloseTo(100, 10);
    });

    it('AC5: devuelve el contador en período y la lista de quienes no renovaron con nombre, código, plan y vencimiento', async () => {
        repo.renovacion.mockResolvedValue([fila('1', '2026-11-01', false), fila('2', '2026-11-18', false)]);

        const res = await service.renovacion('2026-11-01', '2026-11-20', AHORA);

        expect(res.enPeriodo).toBe(1);
        expect(res.noRenovaron).toEqual([{ nombre: 'Miembro 1', codigo: 'MBR-000001', plan: 'Mensual', fechaVencimiento: '2026-11-01' }]);
    });

    it('AC6: sin membresías clasificables no hay porcentajes ("Sin datos suficientes")', async () => {
        repo.renovacion.mockResolvedValue([fila('1', '2026-11-18', false)]);

        const res = await service.renovacion('2026-11-01', '2026-11-20', AHORA);

        expect(res).toMatchObject({ renovadas: 0, canceladas: 0, tasaRenovacion: null, tasaCancelacion: null });
    });

    it('AC7: solo el administrador abre el reporte ("Acceso denegado" para los demás)', () => {
        expect(rolesPermitidos(ReportesController, 'renovacion')).toEqual([Rol.ADMINISTRADOR]);
    });
});
