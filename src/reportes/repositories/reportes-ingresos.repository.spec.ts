import type { PrismaService } from '@Prisma/services';
import { Prisma } from '@PrismaClient';
import { ReportesRepository } from './reportes.repository.js';

const desde = new Date('2026-11-18T06:00:00Z');
const hasta = new Date('2026-11-19T06:00:00Z');

describe('H27 ReportesRepository (Prisma simulado, sin PostgreSQL)', () => {
    const tx = { cobro: { count: vi.fn(), findMany: vi.fn() } };
    const prisma = { $queryRaw: vi.fn(), $transaction: vi.fn() };
    const repo = new ReportesRepository(prisma as unknown as PrismaService);
    beforeEach(() => {
        vi.resetAllMocks();
        prisma.$transaction.mockImplementation((operar: (cliente: typeof tx) => Promise<unknown>) => operar(tx));
    });
    it('agrega solo Cobro.PAGADO por pagadoEn, sin multiplicar filas por intentos/comprobantes', async () => {
        prisma.$queryRaw.mockResolvedValue([]);
        await repo.ingresosPorDia(desde, hasta);
        const [plantilla, ...parametros] = prisma.$queryRaw.mock.calls[0]!;
        const sql = plantilla.join('?');
        expect(parametros).toEqual([desde, hasta]);
        expect(sql).toContain("c.estado = 'PAGADO'");
        expect(sql).toContain('c.pagado_en >= ?'); expect(sql).toContain('c.pagado_en < ?');
        expect(sql).toContain('SUM(c.monto)');
        expect(sql).not.toMatch(/intento_pago|comprobante|creado_en|emitido_en/);
        expect(prisma.$queryRaw).toHaveBeenCalledOnce();
    });
    it('usa la membresía del origen y dueño, tipo histórico y fecha UTC-6, sin leer catálogo Plan', async () => {
        await repo.ingresosPorDia(desde, hasta);
        const sql = prisma.$queryRaw.mock.calls[0]![0].join('?');
        expect(sql).toContain('LEFT JOIN membresia m');
        expect(sql).toContain("c.referencia_tipo = 'MEMBRESIA'");
        expect(sql).toContain("c.concepto IN ('MEMBRESIA', 'RENOVACION')");
        expect(sql).toContain('m.id = c.referencia_id'); expect(sql).toContain('m.miembro_id = c.miembro_id');
        expect(sql).toContain('m.tipo_plan AS "tipoPlan"');
        expect(sql).toContain("to_char(c.pagado_en - INTERVAL '6 hours', 'YYYY-MM-DD')");
        expect(sql).not.toMatch(/JOIN plan\b|precio|DISTINCT/);
    });
    it('devuelve montos Decimal sin convertirlos a number en el repositorio', async () => {
        const filas = [{ concepto: 'MEMBRESIA', tipoPlan: 'MENSUAL', fecha: '2026-11-18', total: new Prisma.Decimal('12.35') }];
        prisma.$queryRaw.mockResolvedValue(filas);
        expect(await repo.ingresosPorDia(desde, hasta)).toBe(filas);
    });
    it.each([[1, 0, 20], [2, 20, 5]])('25 pagos, página %s: skip %s y %s registros con total 25', async (pagina, skip, cantidad) => {
        tx.cobro.count.mockResolvedValue(25);
        tx.cobro.findMany.mockResolvedValue(Array.from({ length: cantidad }, () => ({})));
        const res = await repo.detalleIngresos('MEMBRESIA', desde, hasta, pagina);
        expect(res.total).toBe(25); expect(res.pagos).toHaveLength(cantidad);
        const where = { estado: 'PAGADO', concepto: 'MEMBRESIA', pagadoEn: { gte: desde, lt: hasta } };
        expect(tx.cobro.count).toHaveBeenCalledWith({ where });
        expect(tx.cobro.findMany).toHaveBeenCalledWith({ where, skip, take: 20,
            orderBy: [{ pagadoEn: 'desc' }, { id: 'asc' }], select: {
                id: true, pagadoEn: true, monto: true,
                miembro: { select: { codigoMiembro: true, usuario: { select: { nombre: true, apellido: true } } } },
                comprobante: { select: { intento: { select: { cobroId: true, resultado: true, referencia: true } } } },
            },
        });
        expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'RepeatableRead' });
        expect(tx.cobro.count.mock.invocationCallOrder[0]).toBeLessThan(tx.cobro.findMany.mock.invocationCallOrder[0]!);
    });
    it.each([3, 999_999_999, Number.MAX_SAFE_INTEGER])('página %s fuera de rango conserva total y evita OFFSET excesivo', async (pagina) => {
        tx.cobro.count.mockResolvedValue(25);
        expect(await repo.detalleIngresos('RENOVACION', desde, hasta, pagina)).toEqual({ pagos: [], total: 25 });
        expect(tx.cobro.findMany).not.toHaveBeenCalled();
    });
    it('sin pagos devuelve vacío y total cero', async () => {
        tx.cobro.count.mockResolvedValue(0);
        expect(await repo.detalleIngresos('SESION_ADICIONAL', desde, hasta, 1)).toEqual({ pagos: [], total: 0 });
    });
    it('propaga fallos de lectura sin devolver un conteo/lista parcialmente válidos', async () => {
        tx.cobro.count.mockResolvedValue(25);
        tx.cobro.findMany.mockRejectedValue(new Error('lectura fallida'));
        await expect(repo.detalleIngresos('MEMBRESIA', desde, hasta, 1)).rejects.toThrow('lectura fallida');
    });
});
