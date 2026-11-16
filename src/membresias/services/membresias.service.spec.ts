import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { MembresiaRepository } from '@Membresias/repositories';
import type { CobrosService } from '@Cobros/services';
import type { EstadoMembresiaService } from './estado-membresia.service.js';
import { EstadoMembresia, Prisma, TipoOperacionMembresia, TipoPlan, type Membresia } from '@PrismaClient';
import {
    MEMBRESIA_DE_OTRO_MIEMBRO,
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
    const service = new MembresiasService(repo as unknown as MembresiaRepository, {} as EstadoMembresiaService, {} as CobrosService);

    beforeEach(() => vi.resetAllMocks());

    it('pasa la membresía a PAGADA con su cobertura y la referencia', async () => {
        repo.findById.mockResolvedValue(membresia());
        repo.marcarPagada.mockResolvedValue(pagada('PAGO-1'));

        const resultado = await service.aplicarPago('mem1', ' PAGO-1 ', PAGO);

        expect(repo.marcarPagada).toHaveBeenCalledWith('mem1', 'PAGO-1', {
            fechaInicio: '2026-11-20',
            fechaVencimiento: '2026-12-19',
        }, undefined);
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

describe('MembresiasService.obtenerEstado', () => {
    it('delega en EstadoMembresiaService con la fecha indicada', async () => {
        const estados = { obtenerEstado: vi.fn().mockResolvedValue({ estado: 'VIGENTE' }) };
        const service = new MembresiasService({} as MembresiaRepository, estados as unknown as EstadoMembresiaService, {} as CobrosService);
        await expect(service.obtenerEstado('m1', '2026-11-15')).resolves.toEqual({ estado: 'VIGENTE' });
        expect(estados.obtenerEstado).toHaveBeenCalledWith('m1', '2026-11-15');
    });
});

describe('MembresiasService · membresía del usuario autenticado (H3)', () => {
    const repo = { findMiembroIdDeUsuario: vi.fn(), findConDueno: vi.fn() };
    const estados = { obtenerEstado: vi.fn() };
    const service = new MembresiasService(
        repo as unknown as MembresiaRepository,
        estados as unknown as EstadoMembresiaService,
        {} as CobrosService,
    );

    beforeEach(() => vi.resetAllMocks());

    describe('obtenerMiEstado', () => {
        it('busca el miembro del usuario del token y pide su estado', async () => {
            repo.findMiembroIdDeUsuario.mockResolvedValue('m1');
            estados.obtenerEstado.mockResolvedValue({ estado: 'VIGENTE' });

            await expect(service.obtenerMiEstado('u1', '2026-11-15')).resolves.toEqual({ estado: 'VIGENTE' });
            expect(repo.findMiembroIdDeUsuario).toHaveBeenCalledWith('u1');
            expect(estados.obtenerEstado).toHaveBeenCalledWith('m1', '2026-11-15');
        });

        it('si el usuario no tiene ficha de miembro responde SIN_MEMBRESIA con todo lo demás en null', async () => {
            repo.findMiembroIdDeUsuario.mockResolvedValue(null);

            const estado = await service.obtenerMiEstado('u1');

            expect(estado.estado).toBe('SIN_MEMBRESIA');
            expect(Object.entries(estado).filter(([k, v]) => k !== 'estado' && v !== null)).toEqual([]);
            expect(estados.obtenerEstado).not.toHaveBeenCalled();
        });
    });

    describe('obtenerMiMembresia', () => {
        const propia = {
            ...membresia({ estado: EstadoMembresia.PAGADA, fechaInicio: dia('2026-11-20'), fechaVencimiento: dia('2026-12-19') }),
            miembro: { usuarioId: 'u1' },
            tiposClase: [{ tipoClaseId: 't1' }],
        };

        it('devuelve la membresía si es del usuario autenticado', async () => {
            repo.findConDueno.mockResolvedValue(propia);
            await expect(service.obtenerMiMembresia('mem1', 'u1')).resolves.toEqual({
                id: 'mem1',
                plan: 'Mensual',
                tipoPlan: 'MENSUAL',
                tipoOperacion: 'COMPRA',
                estado: 'PAGADA',
                precio: 35.5,
                cantidadClases: null,
                fechaInicioSolicitada: '2026-11-20',
                fechaInicio: '2026-11-20',
                fechaVencimiento: '2026-12-19',
                tiposClaseIds: ['t1'],
            });
        });

        it('403 si la membresía es de otro miembro', async () => {
            repo.findConDueno.mockResolvedValue(propia);
            await expect(service.obtenerMiMembresia('mem1', 'otro-usuario')).rejects.toThrow(
                new ForbiddenException(MEMBRESIA_DE_OTRO_MIEMBRO),
            );
        });

        it('404 si la membresía no existe', async () => {
            repo.findConDueno.mockResolvedValue(null);
            await expect(service.obtenerMiMembresia('x', 'u1')).rejects.toThrow(new NotFoundException(MEMBRESIA_NO_EXISTE));
        });
    });
});

describe('MembresiasService · confirmación del Módulo 5 (H12)', () => {
    it('al iniciar registra que los cobros MEMBRESIA se confirman con aplicarPago, dentro de la transacción del pago', async () => {
        const cobros = { registrarConfirmacion: vi.fn() };
        const service = new MembresiasService(
            {} as MembresiaRepository,
            {} as EstadoMembresiaService,
            cobros as unknown as CobrosService,
        );
        const aplicar = vi.spyOn(service, 'aplicarPago').mockResolvedValue({ aplicado: true } as never);

        service.onModuleInit();
        expect(cobros.registrarConfirmacion).toHaveBeenCalledWith('MEMBRESIA', expect.any(Function));

        const confirmar = cobros.registrarConfirmacion.mock.calls[0][1];
        const tx = { soy: 'tx' };
        const fechaPago = new Date('2026-11-15T16:00:00Z');
        await confirmar({ referenciaId: 'mem1', referenciaPago: 'PAY-20261115-ABC123', fechaPago }, tx);
        expect(aplicar).toHaveBeenCalledWith('mem1', 'PAY-20261115-ABC123', fechaPago, tx);
    });
});
