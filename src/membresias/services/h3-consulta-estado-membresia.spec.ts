import { ForbiddenException } from '@nestjs/common';
import type { CobrosService } from '@Cobros/services';
import type { MembresiaRepository } from '@Membresias/repositories';
import type { EstadoMembresiaService } from '@Membresias/services';
import { MembresiasController } from '@Membresias/controllers';
import { EstadoMembresia, Prisma, Rol, TipoOperacionMembresia, TipoPlan, type Membresia } from '@PrismaClient';
import { rolesPermitidos } from '../../../test/helpers/roles.js';
import { MembresiasService } from './membresias.service.js';
import { calcularEstadoMembresia, type MembresiaParaEstado } from './reglas-estado.js';

const dia = (d: string) => new Date(`${d}T00:00:00Z`);
const HOY = '2026-11-15';

const m = (datos: Partial<MembresiaParaEstado> = {}): MembresiaParaEstado => ({
    id: 'mem1',
    estado: EstadoMembresia.PAGADA,
    nombrePlan: 'Mensual ilimitado',
    tipoPlan: TipoPlan.MENSUAL,
    cantidadClases: null,
    fechaInicioSolicitada: dia('2026-11-01'),
    fechaInicio: dia('2026-11-01'),
    fechaVencimiento: dia('2026-11-30'),
    tiposClaseIds: ['t1'],
    ...datos,
});

describe('H3. Consulta del estado de mi membresía', () => {
    it('AC1: muestra plan, tipo, estado, fecha de inicio, vencimiento y días restantes', () => {
        expect(calcularEstadoMembresia([m()], HOY)).toMatchObject({
            estado: 'VIGENTE',
            plan: 'Mensual ilimitado',
            tipoPlan: TipoPlan.MENSUAL,
            fechaInicio: '2026-11-01',
            fechaVencimiento: '2026-11-30',
            diasRestantes: 15,
        });
        expect(calcularEstadoMembresia([m({ estado: EstadoMembresia.PENDIENTE_PAGO, fechaInicio: null, fechaVencimiento: null })], HOY).estado).toBe('PENDIENTE_PAGO');
        expect(calcularEstadoMembresia([m({ fechaInicio: dia('2026-11-20'), fechaVencimiento: dia('2026-12-19') })], HOY).estado).toBe('POR_INICIAR');
    });

    it('AC2: en un Set de clases muestra los créditos restantes de los totales', () => {
        const set = m({ tipoPlan: TipoPlan.SET_CLASES, cantidadClases: 8 });
        expect(calcularEstadoMembresia([set], HOY, new Map([['mem1', 3]]))).toMatchObject({
            creditosTotales: 8,
            creditosDisponibles: 5,
        });
    });

    it('AC3: a 3 días o menos del vencimiento el estado es "Próxima a vencer" con su fecha', () => {
        expect(calcularEstadoMembresia([m()], '2026-11-27')).toMatchObject({
            estado: 'PROXIMA_A_VENCER',
            fechaVencimiento: '2026-11-30',
            diasRestantes: 3,
        });
        expect(calcularEstadoMembresia([m()], '2026-11-26').estado).toBe('VIGENTE');
    });

    it('AC4: informa la renovación pendiente de pago o ya pagada por iniciar', () => {
        const renovacionPendiente = m({ id: 'ren', estado: EstadoMembresia.PENDIENTE_PAGO, fechaInicioSolicitada: dia('2026-12-01'), fechaInicio: null, fechaVencimiento: null });
        expect(calcularEstadoMembresia([m(), renovacionPendiente], HOY).renovacion).toEqual({ estado: 'PENDIENTE_PAGO', fechaInicio: '2026-12-01' });

        const renovacionPagada = m({ id: 'ren', fechaInicio: dia('2026-12-01'), fechaVencimiento: dia('2026-12-30') });
        expect(calcularEstadoMembresia([m(), renovacionPagada], HOY).renovacion).toEqual({ estado: 'POR_INICIAR', fechaInicio: '2026-12-01' });
    });

    it('AC5: una membresía cuyo vencimiento ya pasó está "Vencida" con su fecha', () => {
        expect(calcularEstadoMembresia([m({ fechaInicio: dia('2026-10-01'), fechaVencimiento: dia('2026-10-30') })], HOY)).toMatchObject({
            estado: 'VENCIDA',
            fechaVencimiento: '2026-10-30',
        });
    });

    it('AC6: quien nunca ha tenido membresía recibe "Sin membresía"', () => {
        expect(calcularEstadoMembresia([], HOY)).toMatchObject({ estado: 'SIN_MEMBRESIA', plan: null, fechaVencimiento: null });
    });

    it('AC7: solo devuelve la membresía del usuario autenticado y rechaza la de otro miembro', async () => {
        const repo = { findMiembroIdDeUsuario: vi.fn().mockResolvedValue('m1'), findConDueno: vi.fn() };
        const estados = { obtenerEstado: vi.fn().mockResolvedValue({ estado: 'VIGENTE' }) };
        const service = new MembresiasService(repo as unknown as MembresiaRepository, estados as unknown as EstadoMembresiaService, {} as CobrosService);

        await service.obtenerMiEstado('u1', HOY);
        expect(repo.findMiembroIdDeUsuario).toHaveBeenCalledWith('u1');
        expect(estados.obtenerEstado).toHaveBeenCalledWith('m1', HOY);

        const ajena: Membresia & { miembro: { usuarioId: string }; tiposClase: { tipoClaseId: string }[] } = {
            id: 'mem1', miembroId: 'm2', planId: 'p1', nombrePlan: 'Mensual', tipoPlan: TipoPlan.MENSUAL,
            precio: new Prisma.Decimal('35.50'), cantidadClases: null, tipoOperacion: TipoOperacionMembresia.COMPRA,
            membresiaAnteriorId: null, estado: EstadoMembresia.PAGADA, fechaInicioSolicitada: dia('2026-11-01'),
            fechaInicio: dia('2026-11-01'), fechaVencimiento: dia('2026-11-30'), registradaPorId: 'r1',
            pagoAplicadoRef: 'PAY-1', creadoEn: new Date(), miembro: { usuarioId: 'otro' }, tiposClase: [],
        };
        repo.findConDueno.mockResolvedValue(ajena);
        await expect(service.obtenerMiMembresia('mem1', 'u1')).rejects.toBeInstanceOf(ForbiddenException);
        expect(rolesPermitidos(MembresiasController, 'obtenerMia')).toEqual([Rol.MIEMBRO]);
    });
});
