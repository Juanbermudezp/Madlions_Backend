import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { Prisma } from '@PrismaClient';
import type { PagoIngreso, ReportesRepository } from '../repositories/reportes.repository.js';
import { ReportesService } from './reportes.service.js';

const AHORA = new Date('2026-11-18T16:00:00Z');
const pago = (): PagoIngreso => ({ id: 'cobro-1', monto: new Prisma.Decimal('35.50'), pagadoEn: new Date('2026-11-19T02:00:00Z'),
    miembro: { codigoMiembro: 'MBR-000001', usuario: { nombre: 'Ana', apellido: 'Martínez' } },
    comprobante: { intento: { cobroId: 'cobro-1', resultado: 'APROBADO', referencia: 'PAY-20261118-ABC123' } },
});

describe('H27 ReportesService', () => {
    const repo = { ingresosPorDia: vi.fn(), detalleIngresos: vi.fn() };
    const service = new ReportesService(repo as unknown as ReportesRepository);
    beforeEach(() => {
        vi.resetAllMocks();
        repo.ingresosPorDia.mockResolvedValue([]);
        repo.detalleIngresos.mockResolvedValue({ pagos: [pago()], total: 25 });
    });
    it('reutiliza rango H26: últimos 30 días inclusivos y anterior de 30 en una consulta', async () => {
        const res = await service.ingresos(undefined, undefined, AHORA);
        expect(repo.ingresosPorDia).toHaveBeenCalledWith(new Date('2026-09-20T06:00:00Z'), new Date('2026-11-19T06:00:00Z'));
        expect(res.porDia).toHaveLength(30);
        expect(res.porDia[0]).toEqual({ fecha: '2026-10-20', total: 0 });
        expect(res.porDia.at(-1)).toEqual({ fecha: '2026-11-18', total: 0 });
    });
    it('10 días actuales 11..20 se comparan con 1..10, sin omitir el último día', async () => {
        repo.ingresosPorDia.mockResolvedValue([
            { concepto: 'MEMBRESIA', tipoPlan: 'MENSUAL', fecha: '2026-11-10', total: new Prisma.Decimal('900') },
            { concepto: 'MEMBRESIA', tipoPlan: 'MENSUAL', fecha: '2026-11-20', total: new Prisma.Decimal('1130') },
        ]);
        const res = await service.ingresos('2026-11-11', '2026-11-20', AHORA);
        expect(repo.ingresosPorDia).toHaveBeenCalledWith(new Date('2026-11-01T06:00:00Z'), new Date('2026-11-21T06:00:00Z'));
        expect(res.anterior).toEqual({ total: 900, diferencia: 230, porcentaje: 25.6 });
        expect(res.porDia.at(-1)).toEqual({ fecha: '2026-11-20', total: 1130 });
    });
    it('detalle transforma solo los campos del contrato y día pagado local, página 1 por defecto', async () => {
        const res = await service.detalleIngresos({ concepto: 'MEMBRESIA', desde: '2026-11-18', hasta: '2026-11-18' }, AHORA);
        expect(repo.detalleIngresos).toHaveBeenCalledWith('MEMBRESIA', new Date('2026-11-18T06:00:00Z'), new Date('2026-11-19T06:00:00Z'), 1);
        expect(res).toEqual({ total: 25, pagina: 1, items: [{ miembro: 'Ana Martínez', codigo: 'MBR-000001',
            fecha: '2026-11-18', monto: 35.5, referencia: 'PAY-20261118-ABC123' }] });
    });
    it('detalle comparte defaults de 30 días y conserva la página solicitada', async () => {
        await service.detalleIngresos({ concepto: 'RENOVACION', pagina: 2 }, AHORA);
        expect(repo.detalleIngresos).toHaveBeenCalledWith('RENOVACION', new Date('2026-10-20T06:00:00Z'), new Date('2026-11-19T06:00:00Z'), 2);
    });
    it('página vacía no borra el total filtrado', async () => {
        repo.detalleIngresos.mockResolvedValue({ pagos: [], total: 25 });
        expect(await service.detalleIngresos({ concepto: 'MEMBRESIA', pagina: 3 }, AHORA)).toEqual({ items: [], total: 25, pagina: 3 });
    });
    it.each([
        ['2026-11-20', '2026-11-19'], ['2026-02-30', '2026-03-01'], ['2026-01-01', '2027-01-01'],
    ])('rango inválido %s..%s rechaza ambos reportes antes del repositorio', async (desde, hasta) => {
        await expect(service.ingresos(desde, hasta, AHORA)).rejects.toThrow(BadRequestException);
        await expect(service.detalleIngresos({ concepto: 'MEMBRESIA', desde, hasta }, AHORA)).rejects.toThrow(BadRequestException);
        expect(repo.ingresosPorDia).not.toHaveBeenCalled(); expect(repo.detalleIngresos).not.toHaveBeenCalled();
    });
    it.each(['sin comprobante', 'rechazado', 'error', 'intento de otro cobro', 'sin pagadoEn'])('no inventa referencia: %s', async (caso) => {
        const inconsistente = pago();
        if (caso === 'sin comprobante') inconsistente.comprobante = null;
        else if (caso === 'sin pagadoEn') inconsistente.pagadoEn = null;
        else if (caso === 'rechazado') inconsistente.comprobante!.intento.resultado = 'RECHAZADO';
        else if (caso === 'error') inconsistente.comprobante!.intento.resultado = 'ERROR';
        else inconsistente.comprobante!.intento.cobroId = 'otro-cobro';
        repo.detalleIngresos.mockResolvedValue({ pagos: [inconsistente], total: 1 });
        await expect(service.detalleIngresos({ concepto: 'MEMBRESIA' }, AHORA)).rejects.toThrow(InternalServerErrorException);
    });
});
