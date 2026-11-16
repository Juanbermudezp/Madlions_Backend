import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { CobrosService } from '@Cobros/services';
import { MembresiaPendienteError } from '@Membresias/errors';
import type { MembresiaRepository } from '@Membresias/repositories';
import type { PlanConTiposClase, PlanRepository } from '@Planes/repositories';
import {
    ConceptoCobro,
    EstadoMembresia,
    Prisma,
    ReferenciaCobro,
    TipoOperacionMembresia,
    TipoPlan,
} from '@PrismaClient';
import {
    MIEMBRO_NO_EXISTE,
    OPERACION_PENDIENTE,
    PLAN_INACTIVO,
    PLAN_NO_EXISTE,
    RegistroMembresiaService,
} from './registro-membresia.service.js';
import { FECHA_INICIO_INVALIDA } from './reglas-operacion.js';

const HOY = '2026-11-15';
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
const dto = { miembroId: 'm1', planId: 'p1', fechaInicio: '2026-11-20' };

describe('RegistroMembresiaService', () => {
    const repo = {
        findMiembro: vi.fn(),
        tienePendiente: vi.fn(),
        findPagadasDelPlan: vi.fn(),
        registrarConCobro: vi.fn(),
    };
    const planes = { findById: vi.fn() };
    const cobros = { crearCobro: vi.fn() };
    const service = new RegistroMembresiaService(
        repo as unknown as MembresiaRepository,
        planes as unknown as PlanRepository,
        cobros as unknown as CobrosService,
    );
    const tx = { soy: 'la transacción' };

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

    describe('validaciones comunes (resumen y registro)', () => {
        it('404 si el miembro no existe', async () => {
            repo.findMiembro.mockResolvedValue(null);
            await expect(service.registrar(dto, 'u1', HOY)).rejects.toThrow(new NotFoundException(MIEMBRO_NO_EXISTE));
        });

        it('404 si el plan no existe', async () => {
            planes.findById.mockResolvedValue(null);
            await expect(service.resumen(dto, HOY)).rejects.toThrow(new NotFoundException(PLAN_NO_EXISTE));
        });

        it('409 si el plan está inactivo', async () => {
            planes.findById.mockResolvedValue(plan({ activo: false }));
            await expect(service.registrar(dto, 'u1', HOY)).rejects.toThrow(new ConflictException(PLAN_INACTIVO));
        });

        it('409 si el miembro ya tiene una operación pendiente de pago', async () => {
            repo.tienePendiente.mockResolvedValue(true);
            await expect(service.resumen(dto, HOY)).rejects.toThrow(new ConflictException(OPERACION_PENDIENTE));
        });

        it('400 si la fecha de inicio está fuera de rango', async () => {
            await expect(service.registrar({ ...dto, fechaInicio: '2026-11-14' }, 'u1', HOY)).rejects.toThrow(
                new BadRequestException(FECHA_INICIO_INVALIDA),
            );
            expect(repo.registrarConCobro).not.toHaveBeenCalled();
        });

        it('busca solo las membresías pagadas del mismo plan para decidir si es renovación', async () => {
            await service.resumen(dto, HOY);
            expect(repo.findPagadasDelPlan).toHaveBeenCalledWith('m1', 'p1');
        });
    });

    describe('resumen', () => {
        it('devuelve los datos del criterio 2 sin guardar nada', async () => {
            const resumen = await service.resumen(dto, HOY);
            expect(resumen).toEqual({
                miembro: { id: 'm1', nombre: 'María', apellido: 'López', codigo: 'MBR-000002' },
                plan: { id: 'p1', nombre: 'Mensual ilimitado', tipo: 'MENSUAL', cantidadClases: null, tiposClase: [{ id: 't1', nombre: 'Yoga' }] },
                precio: 35.5,
                beneficios: 'Sala y clases.',
                duracionDias: 30,
                tipoOperacion: 'COMPRA',
                fechaInicio: '2026-11-20',
                fechaVencimiento: '2026-12-19',
                fechaInicioFija: false,
            });
            expect(repo.registrarConCobro).not.toHaveBeenCalled();
            expect(cobros.crearCobro).not.toHaveBeenCalled();
        });
    });

    describe('registrar', () => {
        it('guarda la copia del plan y pide el cobro MEMBRESIA dentro de la misma transacción', async () => {
            const respuesta = await service.registrar(dto, 'recepcion1', HOY);

            expect(repo.registrarConCobro).toHaveBeenCalledWith(
                {
                    miembroId: 'm1',
                    planId: 'p1',
                    nombrePlan: 'Mensual ilimitado',
                    tipoPlan: TipoPlan.MENSUAL,
                    precio: new Prisma.Decimal('35.50'),
                    cantidadClases: null,
                    tipoOperacion: TipoOperacionMembresia.COMPRA,
                    membresiaAnteriorId: null,
                    fechaInicioSolicitada: new Date('2026-11-20T00:00:00Z'),
                    registradaPorId: 'recepcion1',
                },
                ['t1'],
                expect.any(Function),
            );
            expect(cobros.crearCobro).toHaveBeenCalledWith(
                {
                    miembroId: 'm1',
                    concepto: ConceptoCobro.MEMBRESIA,
                    detalle: 'Mensual ilimitado',
                    monto: new Prisma.Decimal('35.50'),
                    referenciaTipo: ReferenciaCobro.MEMBRESIA,
                    referenciaId: 'mem1',
                },
                tx,
            );
            expect(respuesta).toEqual({
                id: 'mem1',
                tipoOperacion: 'COMPRA',
                estado: 'PENDIENTE_PAGO',
                plan: { id: 'p1', nombre: 'Mensual ilimitado', tipo: 'MENSUAL' },
                precio: 35.5,
                cobroId: 'c1',
            });
        });

        it('una renovación pide el cobro RENOVACION y enlaza la membresía anterior', async () => {
            repo.findPagadasDelPlan.mockResolvedValue([{ id: 'anterior', fechaVencimiento: new Date('2026-11-30T00:00:00Z') }]);
            const respuesta = await service.registrar(dto, 'u1', HOY);
            expect(repo.registrarConCobro.mock.calls[0][0]).toMatchObject({
                tipoOperacion: 'RENOVACION',
                membresiaAnteriorId: 'anterior',
                fechaInicioSolicitada: new Date('2026-12-01T00:00:00Z'),
            });
            expect(cobros.crearCobro.mock.calls[0][0].concepto).toBe(ConceptoCobro.RENOVACION);
            expect(respuesta.tipoOperacion).toBe('RENOVACION');
        });

        it('si la creación del cobro falla, el error sale de la transacción (no queda la membresía)', async () => {
            cobros.crearCobro.mockRejectedValue(new Error('falló el cobro'));
            await expect(service.registrar(dto, 'u1', HOY)).rejects.toThrow('falló el cobro');
        });

        it('409 si otra petición registró una pendiente al mismo tiempo', async () => {
            repo.registrarConCobro.mockRejectedValue(new MembresiaPendienteError('m1'));
            await expect(service.registrar(dto, 'u1', HOY)).rejects.toThrow(new ConflictException(OPERACION_PENDIENTE));
        });
    });
});
