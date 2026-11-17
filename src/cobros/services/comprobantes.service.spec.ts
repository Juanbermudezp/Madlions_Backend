import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ComprobanteRepository } from '@Cobros/repositories';
import { ConceptoCobro, Prisma, Rol } from '@PrismaClient';
import { COMPROBANTE_AJENO, COMPROBANTE_NO_EXISTE, ComprobantesService } from './comprobantes.service.js';

const comprobante = {
    id: 'x1',
    numero: 'CMP-000007',
    cobroId: 'c1',
    intentoId: 'i1',
    subtotal: new Prisma.Decimal('31.42'),
    iva: new Prisma.Decimal('4.08'),
    total: new Prisma.Decimal('35.50'),
    emitidoEn: new Date('2026-11-15T22:30:00Z'),
    cobro: {
        concepto: ConceptoCobro.MEMBRESIA,
        detalle: 'Mensual ilimitado',
        miembro: { codigoMiembro: 'MBR-000002', usuario: { id: 'u1', nombre: 'María', apellido: 'López' } },
    },
    intento: { referencia: 'PAY-20261115-A1B2C3', ultimos4: '4242' },
};

describe('ComprobantesService.obtener', () => {
    const repo = { findPorNumero: vi.fn() };
    const service = new ComprobantesService(repo as unknown as ComprobanteRepository);

    beforeEach(() => {
        vi.resetAllMocks();
        repo.findPorNumero.mockResolvedValue(comprobante);
    });

    it('el miembro dueño ve su comprobante con la forma del contrato', async () => {
        await expect(service.obtener('CMP-000007', { id: 'u1', rol: Rol.MIEMBRO })).resolves.toEqual({
            numero: 'CMP-000007',
            emitidoEn: '2026-11-15T22:30:00.000Z',
            miembro: { nombre: 'María López', codigo: 'MBR-000002' },
            concepto: 'MEMBRESIA',
            detalle: 'Mensual ilimitado',
            subtotal: 31.42,
            iva: 4.08,
            total: 35.5,
            referencia: 'PAY-20261115-A1B2C3',
            ultimos4: '4242',
        });
    });

    it('el administrador ve cualquier comprobante', async () => {
        await expect(service.obtener('CMP-000007', { id: 'admin', rol: Rol.ADMINISTRADOR })).resolves.toMatchObject({
            numero: 'CMP-000007',
        });
    });

    it('403 si es de otro miembro', async () => {
        await expect(service.obtener('CMP-000007', { id: 'otro', rol: Rol.MIEMBRO })).rejects.toThrow(
            new ForbiddenException(COMPROBANTE_AJENO),
        );
    });

    it('404 si no existe', async () => {
        repo.findPorNumero.mockResolvedValue(null);
        await expect(service.obtener('CMP-999999', { id: 'u1', rol: Rol.MIEMBRO })).rejects.toThrow(
            new NotFoundException(COMPROBANTE_NO_EXISTE),
        );
    });

    it.each(['CMP-1', 'cmp-000007', 'CMP-0000071', '000007'])('404 sin consultar la base si el número no tiene el formato (%s)', async (numero) => {
        await expect(service.obtener(numero, { id: 'u1', rol: Rol.MIEMBRO })).rejects.toThrow(NotFoundException);
        expect(repo.findPorNumero).not.toHaveBeenCalled();
    });
});
