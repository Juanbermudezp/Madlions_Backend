import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { CobroRepository } from '@Cobros/repositories';
import { ConceptoCobro, EstadoCobro, Prisma, ReferenciaCobro, ResultadoPago } from '@PrismaClient';
import type { CobrosService } from './cobros.service.js';
import type { PasarelaSimuladaService } from './pasarela-simulada.service.js';
import { COBRO_AJENO, COBRO_NO_EXISTE, COBRO_YA_PAGADO, PagosService } from './pagos.service.js';

const tarjeta = { titular: 'María López', numero: '4242424242424242', vencimiento: '12/30', cvv: '123' };
const cobro = (extra: Record<string, unknown> = {}) => ({
    id: 'c1',
    miembroId: 'm1',
    concepto: ConceptoCobro.MEMBRESIA,
    detalle: 'Mensual',
    monto: new Prisma.Decimal('35.50'),
    referenciaTipo: ReferenciaCobro.MEMBRESIA,
    referenciaId: 'mem1',
    habilitadoDesde: null,
    estado: EstadoCobro.PENDIENTE,
    pagadoEn: null,
    creadoEn: new Date(),
    miembro: { usuarioId: 'u1' },
    ...extra,
});

describe('PagosService.pagar', () => {
    const repo = { findConDueno: vi.fn(), registrarIntento: vi.fn(), confirmarPago: vi.fn() };
    const pasarela = { procesar: vi.fn() };
    const confirmacion = vi.fn();
    const cobros = { confirmacionDe: vi.fn() };
    const service = new PagosService(
        repo as unknown as CobroRepository,
        cobros as unknown as CobrosService,
        pasarela as unknown as PasarelaSimuladaService,
    );
    const tx = { soy: 'tx' };

    beforeEach(() => {
        vi.resetAllMocks();
        repo.findConDueno.mockResolvedValue(cobro());
        cobros.confirmacionDe.mockReturnValue(confirmacion);
        repo.confirmarPago.mockImplementation(async (_intento, _montos, _fecha, confirmar) => {
            await confirmar(tx);
            return 'CMP-000001';
        });
    });

    describe('validaciones previas (no llegan a la pasarela)', () => {
        it('404 si el cobro no existe', async () => {
            repo.findConDueno.mockResolvedValue(null);
            await expect(service.pagar('c1', 'u1', tarjeta)).rejects.toThrow(new NotFoundException(COBRO_NO_EXISTE));
            expect(pasarela.procesar).not.toHaveBeenCalled();
        });

        it('403 si el cobro es de otro miembro', async () => {
            await expect(service.pagar('c1', 'otro', tarjeta)).rejects.toThrow(new ForbiddenException(COBRO_AJENO));
            expect(pasarela.procesar).not.toHaveBeenCalled();
        });

        it('409 si el cobro ya está pagado', async () => {
            repo.findConDueno.mockResolvedValue(cobro({ estado: EstadoCobro.PAGADO }));
            await expect(service.pagar('c1', 'u1', tarjeta)).rejects.toThrow(new ConflictException(COBRO_YA_PAGADO));
            expect(pasarela.procesar).not.toHaveBeenCalled();
        });

        it('409 si es una renovación que todavía no se puede pagar', async () => {
            repo.findConDueno.mockResolvedValue(
                cobro({ concepto: 'RENOVACION', habilitadoDesde: new Date('2099-01-01T00:00:00Z') }),
            );
            await expect(service.pagar('c1', 'u1', tarjeta)).rejects.toThrow('No habilitado: podrás pagar desde el 01/01/2099');
            expect(pasarela.procesar).not.toHaveBeenCalled();
        });
    });

    describe('resultado de la pasarela', () => {
        it.each([ResultadoPago.RECHAZADO, ResultadoPago.ERROR])(
            '%s: registra el intento con solo los últimos 4, el cobro sigue PENDIENTE y no confirma nada',
            async (resultado) => {
                pasarela.procesar.mockResolvedValue({ resultado, mensaje: 'Mensaje de la pasarela', ultimos4: '0002' });

                const respuesta = await service.pagar('c1', 'u1', tarjeta);

                expect(respuesta).toEqual({ resultado, mensaje: 'Mensaje de la pasarela' });
                const intento = repo.registrarIntento.mock.calls[0][0];
                expect(intento).toMatchObject({ cobroId: 'c1', resultado, ultimos4: '0002' });
                expect(intento.referencia).toMatch(/^PAY-\d{8}-[A-Z0-9]{6}$/);
                expect(JSON.stringify(intento)).not.toContain(tarjeta.numero);
                expect(JSON.stringify(intento)).not.toContain(tarjeta.cvv);
                expect(repo.confirmarPago).not.toHaveBeenCalled();
                expect(confirmacion).not.toHaveBeenCalled();
            },
        );

        it('APROBADO: confirma el pago con el desglose del IVA y avisa a Membresías dentro de la transacción', async () => {
            pasarela.procesar.mockResolvedValue({ resultado: ResultadoPago.APROBADO, mensaje: 'Pago aprobado.', ultimos4: '4242' });

            const respuesta = await service.pagar('c1', 'u1', tarjeta);

            const [intento, montos] = repo.confirmarPago.mock.calls[0];
            expect(intento).toMatchObject({ cobroId: 'c1', resultado: 'APROBADO', ultimos4: '4242' });
            expect(montos).toEqual({ subtotal: 31.42, iva: 4.08, total: 35.5 });
            expect(cobros.confirmacionDe).toHaveBeenCalledWith('MEMBRESIA');
            expect(confirmacion).toHaveBeenCalledWith(
                { referenciaId: 'mem1', referenciaPago: intento.referencia, fechaPago: expect.any(Date) },
                tx,
            );
            expect(respuesta).toEqual({ resultado: 'APROBADO', referencia: intento.referencia, comprobanteNumero: 'CMP-000001' });
            expect(repo.registrarIntento).not.toHaveBeenCalled();
        });

        it('APROBADO pero otro intento lo pagó al mismo tiempo: 409 y no confirma dos veces', async () => {
            pasarela.procesar.mockResolvedValue({ resultado: ResultadoPago.APROBADO, mensaje: 'Pago aprobado.', ultimos4: '4242' });
            repo.confirmarPago.mockResolvedValue(null);

            await expect(service.pagar('c1', 'u1', tarjeta)).rejects.toThrow(new ConflictException(COBRO_YA_PAGADO));
            expect(confirmacion).not.toHaveBeenCalled();
        });

        it('APROBADO de un tipo sin módulo registrado (p. ej. sesión antes de H9): solo marca el cobro pagado', async () => {
            pasarela.procesar.mockResolvedValue({ resultado: ResultadoPago.APROBADO, mensaje: 'Pago aprobado.', ultimos4: '4242' });
            cobros.confirmacionDe.mockReturnValue(undefined);

            await expect(service.pagar('c1', 'u1', tarjeta)).resolves.toMatchObject({ resultado: 'APROBADO' });
        });
    });
});
