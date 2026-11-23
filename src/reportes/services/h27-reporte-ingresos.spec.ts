import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '@Prisma/services';
import { Prisma, Rol } from '@PrismaClient';
import { rolesPermitidos } from '../../../test/helpers/roles.js';
import { ReportesController } from '../controllers/reportes.controller.js';
import { ReportesRepository, type FilaIngreso, type PagoIngreso } from '../repositories/reportes.repository.js';
import { ReportesService } from './reportes.service.js';

const AHORA = new Date('2026-11-21T18:00:00Z');
const fila = (concepto: string, tipoPlan: string | null, fecha: string, total: string) =>
    ({ concepto, tipoPlan, fecha, total: new Prisma.Decimal(total) }) as FilaIngreso;
const pago = (i: number): PagoIngreso => ({
    id: `cobro-${i}`, monto: new Prisma.Decimal('25.00'), pagadoEn: new Date('2026-11-15T16:00:00Z'),
    miembro: { codigoMiembro: 'MBR-000001', usuario: { nombre: 'Ana', apellido: 'Paz' } },
    comprobante: { intento: { cobroId: `cobro-${i}`, resultado: 'APROBADO', referencia: `PAY-20261115-00000${i}` } },
});

describe('H27. Reporte de ingresos', () => {
    const repo = { ingresosPorDia: vi.fn(), detalleIngresos: vi.fn() };
    const service = new ReportesService(repo as unknown as ReportesRepository);

    beforeEach(() => {
        vi.resetAllMocks();
        repo.ingresosPorDia.mockResolvedValue([]);
    });

    it('AC1: muestra el total con IVA incluido y su subtotal e IVA del 13 % con redondeo half-up', async () => {
        repo.ingresosPorDia.mockResolvedValue([fila('MEMBRESIA', 'MENSUAL', '2026-11-15', '35.00'), fila('SESION_ADICIONAL', null, '2026-11-16', '10.00')]);

        const res = await service.ingresos('2026-11-11', '2026-11-20', AHORA);

        expect(res).toMatchObject({ total: 45, subtotal: 39.82, iva: 5.18 });
    });

    it('AC2: desglosa por concepto y por tipo de plan', async () => {
        repo.ingresosPorDia.mockResolvedValue([
            fila('MEMBRESIA', 'DAYPASS', '2026-11-12', '5.00'), fila('RENOVACION', 'MENSUAL', '2026-11-13', '35.00'),
            fila('MEMBRESIA', 'SET_CLASES', '2026-11-14', '40.00'), fila('SESION_ADICIONAL', null, '2026-11-15', '10.00'),
        ]);

        const res = await service.ingresos('2026-11-11', '2026-11-20', AHORA);

        expect(res.porConcepto).toEqual([
            { concepto: 'MEMBRESIA', total: 45 }, { concepto: 'RENOVACION', total: 35 }, { concepto: 'SESION_ADICIONAL', total: 10 },
        ]);
        expect(res.porTipoPlan).toEqual(expect.arrayContaining([
            { tipoPlan: 'DAYPASS', total: 5 }, { tipoPlan: 'MENSUAL', total: 35 }, { tipoPlan: 'SET_CLASES', total: 40 },
        ]));
    });

    it('AC3: solo suma cobros "Pagados" según su fecha de pago', async () => {
        const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
        await new ReportesRepository(prisma as unknown as PrismaService).ingresosPorDia(new Date('2026-11-01T06:00:00Z'), new Date('2026-11-21T06:00:00Z'));

        const sql = (prisma.$queryRaw.mock.calls[0]![0] as string[]).join('?');
        expect(sql).toContain("c.estado = 'PAGADO'");
        expect(sql).toContain('c.pagado_en >= ?');
        expect(sql).not.toMatch(/intento_pago|creado_en/);
    });

    it('AC4: compara con el período anterior de igual duración y sin ingresos previos no hay porcentaje', async () => {
        repo.ingresosPorDia.mockResolvedValue([fila('MEMBRESIA', 'MENSUAL', '2026-11-05', '100.00'), fila('MEMBRESIA', 'MENSUAL', '2026-11-15', '125.00')]);
        const res = await service.ingresos('2026-11-11', '2026-11-20', AHORA);
        expect(repo.ingresosPorDia).toHaveBeenCalledWith(new Date('2026-11-01T06:00:00Z'), new Date('2026-11-21T06:00:00Z'));
        expect(res.anterior).toEqual({ total: 100, diferencia: 25, porcentaje: 25 });

        repo.ingresosPorDia.mockResolvedValue([fila('MEMBRESIA', 'MENSUAL', '2026-11-15', '125.00')]);
        expect((await service.ingresos('2026-11-11', '2026-11-20', AHORA)).anterior.porcentaje).toBeNull();
    });

    it('AC5: aplica el rango de H26 y devuelve el ingreso de cada día del período, con 0 en los días sin pagos', async () => {
        repo.ingresosPorDia.mockResolvedValue([fila('MEMBRESIA', 'MENSUAL', '2026-11-12', '35.00')]);

        const res = await service.ingresos('2026-11-11', '2026-11-13', AHORA);

        expect(res.porDia).toEqual([{ fecha: '2026-11-11', total: 0 }, { fecha: '2026-11-12', total: 35 }, { fecha: '2026-11-13', total: 0 }]);
        await expect(service.ingresos('2026-11-20', '2026-11-10', AHORA)).rejects.toBeInstanceOf(BadRequestException);
        await expect(service.ingresos('2025-01-01', '2026-11-10', AHORA)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('AC6: el detalle de un concepto trae miembro, fecha, monto y transacción en páginas de 20', async () => {
        repo.detalleIngresos.mockResolvedValue({ pagos: [pago(1)], total: 25 });

        const res = await service.detalleIngresos({ concepto: 'MEMBRESIA', desde: '2026-11-11', hasta: '2026-11-20', pagina: 2 }, AHORA);

        expect(repo.detalleIngresos).toHaveBeenCalledWith('MEMBRESIA', expect.any(Date), expect.any(Date), 2);
        expect(res).toEqual({ total: 25, pagina: 2, items: [{ miembro: 'Ana Paz', codigo: 'MBR-000001', fecha: '2026-11-15', monto: 25, referencia: 'PAY-20261115-000001' }] });

        const tx = { cobro: { count: vi.fn().mockResolvedValue(25), findMany: vi.fn().mockResolvedValue([]) } };
        const prisma = { $transaction: vi.fn((operar: (c: typeof tx) => unknown) => operar(tx)) };
        await new ReportesRepository(prisma as unknown as PrismaService).detalleIngresos('MEMBRESIA', new Date(), new Date(), 2);
        expect(tx.cobro.findMany.mock.calls[0][0]).toMatchObject({ skip: 20, take: 20 });
    });

    it('AC7: el reporte y su detalle son solo para el administrador ("Acceso denegado" para los demás)', () => {
        expect(rolesPermitidos(ReportesController, 'ingresos')).toEqual([Rol.ADMINISTRADOR]);
        expect(rolesPermitidos(ReportesController, 'detalleIngresos')).toEqual([Rol.ADMINISTRADOR]);
    });
});
