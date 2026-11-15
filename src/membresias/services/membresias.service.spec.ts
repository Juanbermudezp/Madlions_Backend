import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { MembresiaRepository } from '@Membresias/repositories';
import { EstadoMembresia, Prisma, TipoOperacionMembresia, TipoPlan, type Membresia } from '@PrismaClient';
import {
    MEMBRESIA_NO_EXISTE,
    MEMBRESIA_PAGADA_CON_OTRO_PAGO,
    MembresiasService,
    REFERENCIA_PAGO_EN_USO,
    REFERENCIA_PAGO_INVALIDA,
} from './membresias.service.js';

const dia = (d: string) => new Date(`${d}T00:00:00Z`);
const membresia = (datos: Partial<Membresia> = {}): Membresia => ({
    id: 'mem1',
    miembroId: 'm1',
    planId: 'p1',
    nombrePlan: 'Mensual',
    tipoPlan: TipoPlan.MENSUAL,
    precio: new Prisma.Decimal('35.50'),
    cantidadClases: null,
    tipoOperacion: TipoOperacionMembresia.COMPRA,
    membresiaAnteriorId: null,
    estado: EstadoMembresia.PENDIENTE_PAGO,
    fechaInicioSolicitada: dia('2026-11-20'),
    fechaInicio: null,
    fechaVencimiento: null,
    registradaPorId: 'u1',
    pagoAplicadoRef: null,
    creadoEn: new Date('2026-11-15T12:00:00Z'),
    ...datos,
});
const pagada = (ref: string) =>
    membresia({ estado: EstadoMembresia.PAGADA, pagoAplicadoRef: ref, fechaInicio: dia('2026-11-20'), fechaVencimiento: dia('2026-12-19') });
const PAGO = new Date('2026-11-15T10:00:00-06:00');

describe('MembresiasService.aplicarPago', () => {
    const repo = { findById: vi.fn(), marcarPagada: vi.fn() };
    const service = new MembresiasService(repo as unknown as MembresiaRepository);

    beforeEach(() => vi.resetAllMocks());

    it('pasa la membresía a PAGADA con su cobertura y la referencia', async () => {
        repo.findById.mockResolvedValue(membresia());
        repo.marcarPagada.mockResolvedValue(pagada('PAGO-1'));

        const resultado = await service.aplicarPago('mem1', ' PAGO-1 ', PAGO);

        expect(repo.marcarPagada).toHaveBeenCalledWith('mem1', 'PAGO-1', {
            fechaInicio: '2026-11-20',
            fechaVencimiento: '2026-12-19',
        });
        expect(resultado).toEqual({ aplicado: true, membresia: pagada('PAGO-1') });
    });

    it('una segunda llamada con la misma referencia no hace nada', async () => {
        repo.findById.mockResolvedValue(pagada('PAGO-1'));

        const resultado = await service.aplicarPago('mem1', 'PAGO-1', PAGO);

        expect(resultado.aplicado).toBe(false);
        expect(repo.marcarPagada).not.toHaveBeenCalled();
    });

    it('si otra confirmación la pagó al mismo tiempo con la misma referencia, no hace nada', async () => {
        repo.findById.mockResolvedValueOnce(membresia()).mockResolvedValueOnce(pagada('PAGO-1'));
        repo.marcarPagada.mockResolvedValue(null);

        await expect(service.aplicarPago('mem1', 'PAGO-1', PAGO)).resolves.toMatchObject({ aplicado: false });
    });

    it('409 si ya se pagó con otra referencia', async () => {
        repo.findById.mockResolvedValue(pagada('PAGO-1'));
        await expect(service.aplicarPago('mem1', 'PAGO-2', PAGO)).rejects.toThrow(
            new ConflictException(MEMBRESIA_PAGADA_CON_OTRO_PAGO),
        );
    });

    it('409 si la referencia ya se aplicó a otra membresía', async () => {
        repo.findById.mockResolvedValue(membresia());
        repo.marcarPagada.mockResolvedValue('REFERENCIA_EN_USO');
        await expect(service.aplicarPago('mem1', 'PAGO-1', PAGO)).rejects.toThrow(
            new ConflictException(REFERENCIA_PAGO_EN_USO),
        );
    });

    it('404 si la membresía no existe', async () => {
        repo.findById.mockResolvedValue(null);
        await expect(service.aplicarPago('x', 'PAGO-1', PAGO)).rejects.toThrow(new NotFoundException(MEMBRESIA_NO_EXISTE));
    });

    it.each(['', '   ', 'x'.repeat(101)])('400 con una referencia inválida (%j)', async (ref) => {
        await expect(service.aplicarPago('mem1', ref, PAGO)).rejects.toThrow(new BadRequestException(REFERENCIA_PAGO_INVALIDA));
        expect(repo.findById).not.toHaveBeenCalled();
    });
});
