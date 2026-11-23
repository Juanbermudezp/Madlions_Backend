import { BadRequestException, ConflictException } from '@nestjs/common';
import type { CobroRepository } from '@Cobros/repositories';
import type { CobrosService, PasarelaSimuladaService } from '@Cobros/services';
import { PagosService } from '@Cobros/services';
import type { MembresiaRepository } from '@Membresias/repositories';
import { MembresiasController } from '@Membresias/controllers';
import type { EstadoMembresiaService } from '@Membresias/services';
import type { MiembroRepository } from '@Miembros/repositories';
import { LIMITE_BUSQUEDA } from '@Miembros/repositories';
import { MiembrosService } from '@Miembros/services';
import type { PlanConTiposClase, PlanRepository } from '@Planes/repositories';
import {
    ConceptoCobro,
    EstadoCobro,
    EstadoMembresia,
    Prisma,
    ReferenciaCobro,
    ResultadoPago,
    Rol,
    TipoOperacionMembresia,
    TipoPlan,
    type Membresia,
} from '@PrismaClient';
import { rolesPermitidos } from '../../../test/helpers/roles.js';
import { MembresiasService } from './membresias.service.js';
import { OPERACION_PENDIENTE, RegistroMembresiaService } from './registro-membresia.service.js';
import { determinarOperacion } from './reglas-operacion.js';

const HOY = '2026-11-15';
const dia = (d: string) => new Date(`${d}T00:00:00Z`);
const miembro = { id: 'm1', codigoMiembro: 'MBR-000002', usuario: { nombre: 'María', apellido: 'López' } };
const plan = (datos: Partial<PlanConTiposClase> = {}): PlanConTiposClase => ({
    id: 'p1',
    nombre: 'Mensual ilimitado',
    tipo: TipoPlan.MENSUAL,
    precio: new Prisma.Decimal('35.50'),
    cantidadClases: null,
    duracionDias: 30,
    beneficios: 'Sala y clases.',
    activo: true,
    creadoEn: new Date(),
    actualizadoEn: new Date(),
    tiposClase: [{ tipoClase: { id: 't1', nombre: 'Yoga' } }],
    ...datos,
});
const membresia = (datos: Partial<Membresia> = {}): Membresia => ({
    id: 'mem1',
    miembroId: 'm1',
    planId: 'p1',
    nombrePlan: 'Set 8 clases',
    tipoPlan: TipoPlan.SET_CLASES,
    precio: new Prisma.Decimal('35.50'),
    cantidadClases: 8,
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

describe('H2. Registro de compra o renovación de membresía', () => {
    const repo = { findMiembro: vi.fn(), tienePendiente: vi.fn(), findPagadasDelPlan: vi.fn(), registrarConCobro: vi.fn(), findById: vi.fn(), marcarPagada: vi.fn() };
    const planes = { findById: vi.fn() };
    const cobros = { crearCobro: vi.fn(), confirmacionDe: vi.fn() };
    const registro = new RegistroMembresiaService(
        repo as unknown as MembresiaRepository,
        planes as unknown as PlanRepository,
        cobros as unknown as CobrosService,
    );
    const membresias = new MembresiasService(repo as unknown as MembresiaRepository, {} as EstadoMembresiaService, cobros as unknown as CobrosService);
    const tx = { soy: 'la transacción' };
    const dto = { miembroId: 'm1', planId: 'p1', fechaInicio: '2026-11-20' };

    beforeEach(() => {
        vi.resetAllMocks();
        repo.findMiembro.mockResolvedValue(miembro);
        repo.tienePendiente.mockResolvedValue(false);
        repo.findPagadasDelPlan.mockResolvedValue([]);
        planes.findById.mockResolvedValue(plan());
        cobros.crearCobro.mockResolvedValue({ id: 'c1' });
        repo.registrarConCobro.mockImplementation(async (datos, _tipos, crearCobro) => {
            const cobro = await crearCobro(tx, 'mem1');
            return { membresia: { id: 'mem1', estado: EstadoMembresia.PENDIENTE_PAGO, ...datos }, cobro };
        });
    });

    it('AC1: busca miembros por nombre, documento o código y muestra hasta 20 con su estado de membresía', async () => {
        const miembrosRepo = { buscar: vi.fn().mockResolvedValue([{ id: 'm1', nombre: 'María', apellido: 'López', codigo: 'MBR-000002', documento: '01234567-8' }]) };
        const estados = { estadosDe: vi.fn().mockResolvedValue(new Map([['m1', { estado: 'VIGENTE', fechaVencimiento: '2026-11-30' }]])) };
        const service = new MiembrosService(miembrosRepo as unknown as MiembroRepository, estados as unknown as EstadoMembresiaService);

        await expect(service.buscar('MBR-000002', Rol.RECEPCION)).resolves.toEqual([
            { id: 'm1', nombre: 'María', apellido: 'López', codigo: 'MBR-000002', documento: '01234567-8', estadoMembresia: 'VIGENTE', fechaVencimiento: '2026-11-30' },
        ]);
        expect(LIMITE_BUSQUEDA).toBe(20);
    });

    it('AC2: la compra acepta de hoy a 30 días; la renovación de una vigente queda fija al día siguiente del vencimiento; el resumen trae todo', async () => {
        const resumen = await registro.resumen(dto, HOY);
        expect(resumen).toMatchObject({
            miembro: { id: 'm1', codigo: 'MBR-000002' },
            plan: { id: 'p1', nombre: 'Mensual ilimitado', tipo: TipoPlan.MENSUAL },
            precio: 35.5,
            beneficios: 'Sala y clases.',
            duracionDias: 30,
            tipoOperacion: TipoOperacionMembresia.COMPRA,
            fechaInicio: '2026-11-20',
            fechaVencimiento: '2026-12-19',
        });

        repo.findPagadasDelPlan.mockResolvedValue([{ id: 'ant', fechaVencimiento: dia('2026-11-25') }]);
        await expect(registro.resumen({ ...dto, fechaInicio: HOY }, HOY)).resolves.toMatchObject({
            tipoOperacion: TipoOperacionMembresia.RENOVACION,
            fechaInicio: '2026-11-26',
            fechaInicioFija: true,
        });
    });

    it('AC3: es renovación con una Mensual o Set del mismo plan (vigente o vencida); un Daypass siempre es compra', () => {
        const base = { duracionDias: 30, hoy: HOY, fechaSolicitada: HOY };
        const vencida = [{ id: 'ant', fechaVencimiento: dia('2026-10-01') }];

        const renovacion = determinarOperacion({ ...base, tipoPlan: TipoPlan.SET_CLASES, pagadasDelPlan: vencida });
        expect(renovacion.ok && renovacion.operacion.tipoOperacion).toBe(TipoOperacionMembresia.RENOVACION);

        const daypass = determinarOperacion({ ...base, tipoPlan: TipoPlan.DAYPASS, duracionDias: 1, pagadasDelPlan: vencida });
        expect(daypass.ok && daypass.operacion.tipoOperacion).toBe(TipoOperacionMembresia.COMPRA);
    });

    it('AC4: confirmar guarda la membresía "Pendiente de pago" con las condiciones del plan y pide un cobro pendiente', async () => {
        const res = await registro.registrar(dto, 'recepcion-1', HOY);

        expect(res).toMatchObject({ id: 'mem1', estado: EstadoMembresia.PENDIENTE_PAGO, cobroId: 'c1', tipoOperacion: TipoOperacionMembresia.COMPRA });
        expect(repo.registrarConCobro.mock.calls[0][0]).toMatchObject({
            nombrePlan: 'Mensual ilimitado', tipoPlan: TipoPlan.MENSUAL, registradaPorId: 'recepcion-1',
            fechaInicioSolicitada: dia('2026-11-20'),
        });
        expect(cobros.crearCobro).toHaveBeenCalledWith(
            expect.objectContaining({ concepto: ConceptoCobro.MEMBRESIA, referenciaTipo: ReferenciaCobro.MEMBRESIA, referenciaId: 'mem1' }),
            tx,
        );
    });

    it('AC5: al confirmarse el pago pasa a "Pagada" y la cobertura empieza en la fecha elegida o el día del pago si es posterior', async () => {
        repo.findById.mockResolvedValue(membresia());
        repo.marcarPagada.mockImplementation((_id, ref, cobertura) => Promise.resolve(membresia({ estado: EstadoMembresia.PAGADA, pagoAplicadoRef: ref, ...cobertura })));

        await membresias.aplicarPago('mem1', 'PAY-1', new Date('2026-11-15T10:00:00-06:00'));
        expect(repo.marcarPagada).toHaveBeenLastCalledWith('mem1', 'PAY-1', { fechaInicio: '2026-11-20', fechaVencimiento: '2026-12-19' }, undefined);

        await membresias.aplicarPago('mem1', 'PAY-2', new Date('2026-11-22T10:00:00-06:00'));
        expect(repo.marcarPagada).toHaveBeenLastCalledWith('mem1', 'PAY-2', { fechaInicio: '2026-11-22', fechaVencimiento: '2026-12-21' }, undefined);
    });

    it('AC6: si el pago es rechazado o da error la membresía sigue pendiente y no se activa', async () => {
        const cobroRepo = { findConDueno: vi.fn(), registrarIntento: vi.fn(), confirmarPago: vi.fn() };
        const pasarela = { procesar: vi.fn() };
        const confirmar = vi.fn();
        cobros.confirmacionDe.mockReturnValue(confirmar);
        const pagos = new PagosService(cobroRepo as unknown as CobroRepository, cobros as unknown as CobrosService, pasarela as unknown as PasarelaSimuladaService);
        cobroRepo.findConDueno.mockResolvedValue({
            id: 'c1', concepto: ConceptoCobro.MEMBRESIA, monto: new Prisma.Decimal('35.50'), referenciaTipo: ReferenciaCobro.MEMBRESIA,
            referenciaId: 'mem1', habilitadoDesde: null, estado: EstadoCobro.PENDIENTE, miembro: { usuarioId: 'u1' },
        });

        for (const resultado of [ResultadoPago.RECHAZADO, ResultadoPago.ERROR]) {
            pasarela.procesar.mockResolvedValue({ resultado, mensaje: 'x', ultimos4: '0002' });
            await pagos.pagar('c1', 'u1', { titular: 'María', numero: '4000000000000002', vencimiento: '12/30', cvv: '123' });
        }
        expect(cobroRepo.confirmarPago).not.toHaveBeenCalled();
        expect(confirmar).not.toHaveBeenCalled();
    });

    it('AC7: rechaza otra operación con una pendiente de pago y una fecha de inicio fuera de hoy a 30 días', async () => {
        repo.tienePendiente.mockResolvedValue(true);
        await expect(registro.registrar(dto, 'r1', HOY)).rejects.toThrow(new ConflictException(OPERACION_PENDIENTE));

        repo.tienePendiente.mockResolvedValue(false);
        for (const fechaInicio of ['2026-11-14', '2026-12-16']) {
            await expect(registro.registrar({ ...dto, fechaInicio }, 'r1', HOY)).rejects.toThrow(
                new BadRequestException('La fecha de inicio debe estar entre hoy y los próximos 30 días'),
            );
        }
        expect(repo.registrarConCobro).not.toHaveBeenCalled();
    });

    it('AC8: la misma confirmación de pago que llega dos veces se aplica una sola vez', async () => {
        repo.findById.mockResolvedValueOnce(membresia());
        repo.marcarPagada.mockResolvedValue(membresia({ estado: EstadoMembresia.PAGADA, pagoAplicadoRef: 'PAY-1' }));
        await expect(membresias.aplicarPago('mem1', 'PAY-1', new Date())).resolves.toMatchObject({ aplicado: true });

        repo.findById.mockResolvedValueOnce(membresia({ estado: EstadoMembresia.PAGADA, pagoAplicadoRef: 'PAY-1' }));
        await expect(membresias.aplicarPago('mem1', 'PAY-1', new Date())).resolves.toMatchObject({ aplicado: false });
        expect(repo.marcarPagada).toHaveBeenCalledTimes(1);
    });

    it('AC9: solo recepción puede registrar compras o renovaciones', () => {
        expect(rolesPermitidos(MembresiasController, 'registrar')).toEqual([Rol.RECEPCION]);
        expect(rolesPermitidos(MembresiasController, 'resumen')).toEqual([Rol.RECEPCION]);
    });
});
