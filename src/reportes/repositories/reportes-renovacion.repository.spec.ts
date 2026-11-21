import type { PrismaService } from '@Prisma/services';
import { ReportesRepository } from './reportes.repository.js';
import { AHORA_H28, originalesH28 } from '../../../test/qa/h28-fixtures.js';

describe('H28 SQL parametrizado (sin ejecutarlo en PostgreSQL)', () => {
    const prisma = { $queryRaw: vi.fn() };
    const repo = new ReportesRepository(prisma as unknown as PrismaService);
    beforeEach(() => vi.resetAllMocks());
    const consulta = () => repo.renovacion('2026-10-07', '2026-11-06', AHORA_H28);
    it('una consulta parametrizada, sin catálogo actual ni escritura ni joins de intentos', async () => {
        const filas = originalesH28(); prisma.$queryRaw.mockResolvedValue(filas);
        expect(await consulta()).toBe(filas);
        expect(prisma.$queryRaw).toHaveBeenCalledOnce();
        const [plantilla, ...parametros] = prisma.$queryRaw.mock.calls[0]!;
        expect(parametros).toEqual([AHORA_H28, '2026-10-07', '2026-11-06', AHORA_H28]);
        const sql = plantilla.join('?');
        expect(sql).not.toMatch(/JOIN plan\b|intento_pago|comprobante|creado_en|UPDATE|DELETE|INSERT|GROUP BY|DISTINCT/);
        expect(sql).toContain('m.nombre_plan AS plan');
        expect(sql).toContain("m.estado = 'PAGADA' AND m.tipo_plan IN ('MENSUAL', 'SET_CLASES')");
        expect(sql).toContain('m.fecha_vencimiento >= ?::date AND m.fecha_vencimiento <= ?::date');
        expect(sql).toContain("to_char(m.fecha_vencimiento, 'YYYY-MM-DD')");
    });
    it('ambos cobros pagados pertenecen al origen/renovación y al mismo miembro', async () => {
        await consulta(); const sql = prisma.$queryRaw.mock.calls[0]![0].join('?');
        for (const fragmento of ["c.referencia_tipo = 'MEMBRESIA'", 'c.referencia_id = m.id AND c.miembro_id = m.miembro_id',
            "c.concepto IN ('MEMBRESIA', 'RENOVACION') AND c.estado = 'PAGADO'", 'c.pagado_en <= ?',
            "cr.referencia_tipo = 'MEMBRESIA'", 'cr.referencia_id = r.id AND cr.miembro_id = r.miembro_id',
            "cr.concepto = 'RENOVACION' AND cr.estado = 'PAGADO'", 'r.membresia_anterior_id = m.id AND r.miembro_id = m.miembro_id',
            "r.tipo_operacion = 'RENOVACION' AND r.estado = 'PAGADA'"]) expect(sql).toContain(fragmento);
        expect(sql.match(/EXISTS \(/g)).toHaveLength(2);
    });
    it('ventana0–7 local inclusiva con extremoUTC exclusivo día8 y sin pagos futuros', async () => {
        await consulta(); const sql = prisma.$queryRaw.mock.calls[0]![0].join('?');
        expect(sql).toContain("cr.pagado_en >= m.fecha_vencimiento::timestamp + INTERVAL '6 hours'");
        expect(sql).toContain("cr.pagado_en < (m.fecha_vencimiento + 8)::timestamp + INTERVAL '6 hours'");
        expect(sql).toContain('cr.pagado_en <= ?');
        expect(sql).toContain('ORDER BY m.fecha_vencimiento DESC, m.id ASC');
    });
});
