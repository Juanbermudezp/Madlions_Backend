import type { CobroRepository, DatosCobro } from '@Cobros/repositories';
import { ConceptoCobro, EstadoCobro, Prisma, ReferenciaCobro } from '@PrismaClient';
import {
    CobroInvalidoError,
    CobrosService,
    DETALLE_COBRO_INVALIDO,
    MONTO_COBRO_INVALIDO,
    RENOVACION_SIN_FECHA,
} from './cobros.service.js';

const datos = (extra: Partial<DatosCobro> = {}): DatosCobro => ({
    miembroId: 'm1',
    concepto: ConceptoCobro.MEMBRESIA,
    detalle: 'Mensual ilimitado',
    monto: 35.5,
    referenciaTipo: ReferenciaCobro.MEMBRESIA,
    referenciaId: 'mem1',
    ...extra,
});

describe('CobrosService.crearCobro', () => {
    const repo = { create: vi.fn(), findDeUsuario: vi.fn() };
    const service = new CobrosService(repo as unknown as CobroRepository);
    const tx = {} as Prisma.TransactionClient;

    beforeEach(() => {
        vi.resetAllMocks();
        repo.create.mockResolvedValue({ id: 'c1' });
    });

    it('compra de membresía: se puede pagar desde que se genera (habilitadoDesde null)', async () => {
        await expect(service.crearCobro(datos(), tx)).resolves.toEqual({ id: 'c1' });
        expect(repo.create).toHaveBeenCalledWith({ ...datos(), habilitadoDesde: null }, tx);
    });

    it('sesión adicional: se puede pagar desde que se genera', async () => {
        const sesion = datos({
            concepto: ConceptoCobro.SESION_ADICIONAL,
            detalle: 'Sesión 20/11/2026 10:00 con Carlos Martínez',
            monto: 12.5,
            referenciaTipo: ReferenciaCobro.SESION,
            referenciaId: 's1',
        });
        await service.crearCobro(sesion);
        expect(repo.create).toHaveBeenCalledWith({ ...sesion, habilitadoDesde: null }, undefined);
    });

    it('renovación: guarda como habilitadoDesde el vencimiento de la membresía actual', async () => {
        const vence = new Date('2026-11-30T00:00:00Z');
        await service.crearCobro(datos({ concepto: ConceptoCobro.RENOVACION, habilitadoDesde: vence }), tx);
        expect(repo.create.mock.calls[0][0]).toMatchObject({ concepto: 'RENOVACION', habilitadoDesde: vence });
    });

    it.each([undefined, null])('renovación sin fecha de vencimiento (%s): no crea el cobro', async (habilitadoDesde) => {
        await expect(
            service.crearCobro(datos({ concepto: ConceptoCobro.RENOVACION, habilitadoDesde })),
        ).rejects.toThrow(new CobroInvalidoError(RENOVACION_SIN_FECHA));
        expect(repo.create).not.toHaveBeenCalled();
    });

    it('quita los espacios del detalle', async () => {
        await service.crearCobro(datos({ detalle: '  Mensual  ' }));
        expect(repo.create.mock.calls[0][0].detalle).toBe('Mensual');
    });

    it.each(['', '   ', 'x'.repeat(151)])('detalle inválido (%j): no crea el cobro', async (detalle) => {
        await expect(service.crearCobro(datos({ detalle }))).rejects.toThrow(new CobroInvalidoError(DETALLE_COBRO_INVALIDO));
        expect(repo.create).not.toHaveBeenCalled();
    });

    it.each([0, -1, new Prisma.Decimal(0)])('monto %s: no crea el cobro', async (monto) => {
        await expect(service.crearCobro(datos({ monto }))).rejects.toThrow(new CobroInvalidoError(MONTO_COBRO_INVALIDO));
    });

    it('acepta el monto como Decimal de Prisma (el precio copiado del plan)', async () => {
        await service.crearCobro(datos({ monto: new Prisma.Decimal('35.50') }));
        expect(repo.create).toHaveBeenCalled();
    });

    it('si falla al guardar, el error sale para que la transacción se deshaga', async () => {
        repo.create.mockRejectedValue(new Error('falló la base'));
        await expect(service.crearCobro(datos(), tx)).rejects.toThrow('falló la base');
    });
});

describe('CobrosService.listarMios', () => {
    const repo = { create: vi.fn(), findDeUsuario: vi.fn() };
    const service = new CobrosService(repo as unknown as CobroRepository);
    const dia = (d: string) => new Date(`${d}T00:00:00Z`);
    const cobro = (extra: Record<string, unknown>) => ({
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
        comprobante: null,
        ...extra,
    });

    beforeEach(() => vi.resetAllMocks());

    it('busca solo los cobros del usuario del token, con el filtro de estado', async () => {
        repo.findDeUsuario.mockResolvedValue([]);
        await service.listarMios('u1', EstadoCobro.PENDIENTE, '2026-11-15');
        expect(repo.findDeUsuario).toHaveBeenCalledWith('u1', 'PENDIENTE');
    });

    it('devuelve la forma del contrato y calcula habilitado con la fecha de hoy', async () => {
        repo.findDeUsuario.mockResolvedValue([
            cobro({ id: 'compra' }),
            cobro({ id: 'renovacion-hoy', concepto: 'RENOVACION', habilitadoDesde: dia('2026-11-15') }),
            cobro({ id: 'renovacion-futura', concepto: 'RENOVACION', habilitadoDesde: dia('2026-11-16') }),
            cobro({ id: 'pagado', estado: 'PAGADO', pagadoEn: new Date('2026-11-14T22:30:00Z'), comprobante: { numero: 'CMP-000001' } }),
        ]);

        const lista = await service.listarMios('u1', undefined, '2026-11-15');

        expect(lista[0]).toEqual({
            id: 'compra',
            concepto: 'MEMBRESIA',
            detalle: 'Mensual',
            monto: 35.5,
            estado: 'PENDIENTE',
            habilitado: true,
            habilitadoDesde: null,
            pagadoEn: null,
            comprobanteNumero: null,
        });
        expect(lista.map((c) => [c.id, c.habilitado, c.habilitadoDesde, c.comprobanteNumero])).toEqual([
            ['compra', true, null, null],
            ['renovacion-hoy', true, '2026-11-15', null],
            ['renovacion-futura', false, '2026-11-16', null],
            ['pagado', false, null, 'CMP-000001'],
        ]);
        expect(lista[3].pagadoEn).toBe('2026-11-14T22:30:00.000Z');
    });
});
