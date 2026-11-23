import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { ComprobanteRepository, CobroRepository } from '@Cobros/repositories';
import { ConceptoCobro, EstadoCobro, Prisma, ReferenciaCobro, ResultadoPago, Rol } from '@PrismaClient';
import { CobrosService } from './cobros.service.js';
import { ComprobantesService } from './comprobantes.service.js';
import { PagosService } from './pagos.service.js';
import { PasarelaSimuladaService } from './pasarela-simulada.service.js';
import { desglosarIva, resultadoPorTarjeta } from './reglas-pago.js';

const dia = (d: string) => new Date(`${d}T00:00:00Z`);
const tarjeta = { titular: 'María López', numero: '4242424242424242', vencimiento: '12/30', cvv: '123' };
const cobro = (extra: Record<string, unknown> = {}) => ({
    id: 'c1',
    miembroId: 'm1',
    concepto: ConceptoCobro.MEMBRESIA,
    detalle: 'Mensual ilimitado',
    monto: new Prisma.Decimal('35.50'),
    referenciaTipo: ReferenciaCobro.MEMBRESIA,
    referenciaId: 'mem1',
    habilitadoDesde: null,
    estado: EstadoCobro.PENDIENTE,
    pagadoEn: null,
    creadoEn: new Date(),
    comprobante: null,
    miembro: { usuarioId: 'u1' },
    ...extra,
});

describe('H12. Pago de membresía, renovación o sesión adicional', () => {
    const repo = { findDeUsuario: vi.fn(), create: vi.fn(), findConDueno: vi.fn(), registrarIntento: vi.fn(), confirmarPago: vi.fn() };
    const pasarela = { procesar: vi.fn() };
    const confirmacion = vi.fn();
    const cobrosMock = { confirmacionDe: vi.fn() };
    const cobros = new CobrosService(repo as unknown as CobroRepository);
    const pagos = new PagosService(repo as unknown as CobroRepository, cobrosMock as unknown as CobrosService, pasarela as unknown as PasarelaSimuladaService);
    const tx = { soy: 'tx' };

    beforeEach(() => {
        vi.resetAllMocks();
        repo.findConDueno.mockResolvedValue(cobro());
        cobrosMock.confirmacionDe.mockReturnValue(confirmacion);
        pasarela.procesar.mockResolvedValue({ resultado: ResultadoPago.APROBADO, mensaje: 'Pago aprobado.', ultimos4: '4242' });
        repo.confirmarPago.mockImplementation(async (_intento, _montos, _fecha, confirmar) => {
            await confirmar(tx);
            return 'CMP-000001';
        });
    });

    it('AC1: "Mis pagos" lista los cobros del miembro con concepto, detalle, monto y la fecha de habilitación de las renovaciones', async () => {
        repo.findDeUsuario.mockResolvedValue([
            cobro({ concepto: ConceptoCobro.SESION_ADICIONAL, detalle: '20/11/2026 07:00 con Carlos Martínez', monto: new Prisma.Decimal('10.00') }),
            cobro({ id: 'c2', concepto: ConceptoCobro.RENOVACION, habilitadoDesde: dia('2026-11-30') }),
        ]);

        const lista = await cobros.listarMios('u1', EstadoCobro.PENDIENTE, '2026-11-15');

        expect(repo.findDeUsuario).toHaveBeenCalledWith('u1', EstadoCobro.PENDIENTE);
        expect(lista[0]).toMatchObject({ concepto: 'SESION_ADICIONAL', detalle: '20/11/2026 07:00 con Carlos Martínez', monto: 10 });
        expect(lista[1]).toMatchObject({ concepto: 'RENOVACION', habilitadoDesde: '2026-11-30' });
    });

    it('AC2: compras y sesiones se pagan desde que se generan; una renovación no se puede pagar antes de su fecha', async () => {
        repo.findDeUsuario.mockResolvedValue([cobro(), cobro({ id: 'c2', concepto: ConceptoCobro.RENOVACION, habilitadoDesde: dia('2026-11-30') })]);
        const [compra, renovacion] = await cobros.listarMios('u1', undefined, '2026-11-15');
        expect(compra.habilitado).toBe(true);
        expect(renovacion.habilitado).toBe(false);

        repo.findConDueno.mockResolvedValue(cobro({ concepto: ConceptoCobro.RENOVACION, habilitadoDesde: dia('2099-01-01') }));
        await expect(pagos.pagar('c1', 'u1', tarjeta)).rejects.toThrow('No habilitado: podrás pagar desde el 01/01/2099');
        expect(pasarela.procesar).not.toHaveBeenCalled();
    });

    it('AC3: la pasarela tarda 2 segundos y decide por la tarjeta: 4242 aprueba, 0002 rechaza, 0119 da error', async () => {
        expect(resultadoPorTarjeta('4242424242424242')).toBe(ResultadoPago.APROBADO);
        expect(resultadoPorTarjeta('4000000000000002')).toBe(ResultadoPago.RECHAZADO);
        expect(resultadoPorTarjeta('4000000000000119')).toBe(ResultadoPago.ERROR);

        vi.useFakeTimers();
        try {
            let listo = false;
            const promesa = new PasarelaSimuladaService().procesar(tarjeta).then((r) => { listo = true; return r; });
            await vi.advanceTimersByTimeAsync(1999);
            expect(listo).toBe(false);
            await vi.advanceTimersByTimeAsync(1);
            await expect(promesa).resolves.toMatchObject({ resultado: ResultadoPago.APROBADO, ultimos4: '4242' });
        } finally {
            vi.useRealTimers();
        }
    });

    it('AC4: un pago aprobado deja el cobro pagado con su referencia y confirma la membresía en la misma transacción', async () => {
        const res = await pagos.pagar('c1', 'u1', tarjeta);

        expect(res).toMatchObject({ resultado: ResultadoPago.APROBADO, comprobanteNumero: 'CMP-000001' });
        expect(res.referencia).toMatch(/^PAY-\d{8}-[A-Z0-9]{6}$/);
        const [intento] = repo.confirmarPago.mock.calls[0];
        expect(intento).toMatchObject({ cobroId: 'c1', resultado: ResultadoPago.APROBADO, ultimos4: '4242' });
        expect(confirmacion).toHaveBeenCalledWith(expect.objectContaining({ referenciaId: 'mem1', referenciaPago: res.referencia }), tx);
    });

    it('AC5: el comprobante trae número, transacción, concepto, subtotal, IVA del 13 % y total', async () => {
        expect(desglosarIva('35.50')).toEqual({ subtotal: 31.42, iva: 4.08, total: 35.5 });

        const comprobantesRepo = {
            findPorNumero: vi.fn().mockResolvedValue({
                numero: 'CMP-000001',
                emitidoEn: new Date('2026-11-15T16:00:00Z'),
                subtotal: new Prisma.Decimal('31.42'),
                iva: new Prisma.Decimal('4.08'),
                total: new Prisma.Decimal('35.50'),
                intento: { referencia: 'PAY-20261115-ABC123', ultimos4: '4242' },
                cobro: { concepto: 'MEMBRESIA', detalle: 'Mensual ilimitado', miembro: { codigoMiembro: 'MBR-000002', usuario: { id: 'u1', nombre: 'María', apellido: 'López' } } },
            }),
        };
        const comprobantes = new ComprobantesService(comprobantesRepo as unknown as ComprobanteRepository);

        await expect(comprobantes.obtener('CMP-000001', { id: 'u1', rol: Rol.MIEMBRO })).resolves.toMatchObject({
            numero: 'CMP-000001', referencia: 'PAY-20261115-ABC123', concepto: 'MEMBRESIA',
            subtotal: 31.42, iva: 4.08, total: 35.5, emitidoEn: '2026-11-15T16:00:00.000Z',
        });
    });

    it('AC6: si la pasarela rechaza o falla, el cobro sigue pendiente, no se confirma nada y se devuelve su mensaje', async () => {
        for (const resultado of [ResultadoPago.RECHAZADO, ResultadoPago.ERROR]) {
            pasarela.procesar.mockResolvedValue({ resultado, mensaje: 'Mensaje de la pasarela', ultimos4: '0002' });
            await expect(pagos.pagar('c1', 'u1', tarjeta)).resolves.toEqual({ resultado, mensaje: 'Mensaje de la pasarela' });
        }
        expect(repo.registrarIntento).toHaveBeenCalledTimes(2);
        expect(repo.confirmarPago).not.toHaveBeenCalled();
        expect(confirmacion).not.toHaveBeenCalled();
    });

    it('AC7: nunca guarda el número completo de la tarjeta ni el código de seguridad', async () => {
        pasarela.procesar.mockResolvedValue({ resultado: ResultadoPago.RECHAZADO, mensaje: 'x', ultimos4: '4242' });
        await pagos.pagar('c1', 'u1', tarjeta);

        const guardado = JSON.stringify(repo.registrarIntento.mock.calls[0][0]);
        expect(guardado).not.toContain(tarjeta.numero);
        expect(guardado).not.toContain(tarjeta.cvv);
        expect(guardado).toContain('"ultimos4":"4242"');
    });

    it('AC8: rechaza pagar una renovación no habilitada, un cobro de otro miembro o uno ya pagado', async () => {
        await expect(pagos.pagar('c1', 'otro', tarjeta)).rejects.toBeInstanceOf(ForbiddenException);

        repo.findConDueno.mockResolvedValue(cobro({ estado: EstadoCobro.PAGADO }));
        await expect(pagos.pagar('c1', 'u1', tarjeta)).rejects.toThrow(new ConflictException('El cobro ya fue pagado.'));

        expect(pasarela.procesar).not.toHaveBeenCalled();
        expect(repo.registrarIntento).not.toHaveBeenCalled();
    });
});
