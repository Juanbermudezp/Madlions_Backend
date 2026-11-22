import { ConflictException } from '@nestjs/common';
import type { RegistroAccesoRepository } from '@Accesos/repositories';
import type { EstadoMembresiaService } from '@Membresias/services';
import { calcularEstadoMembresia, type MembresiaParaEstado } from '@Membresias/services';
import type { MiembroRepository } from '@Miembros/repositories';
import { MiembrosService } from '@Miembros/services';
import { EstadoMembresia, Rol, TipoPlan } from '@PrismaClient';
import { AccesosService } from './accesos.service.js';
import { motivoValido, requiereMotivo } from './reglas-acceso.js';

const AHORA = new Date('2026-11-16T15:00:00Z'); // lunes 09:00 en El Salvador
const dia = (d: string) => new Date(`${d}T00:00:00Z`);
const miembro = { id: 'm1', codigoMiembro: 'MBR-000002', usuario: { nombre: 'María', apellido: 'López' } };
const membresia = (datos: Partial<MembresiaParaEstado> = {}): MembresiaParaEstado => ({
    id: 'mem1', estado: EstadoMembresia.PAGADA, nombrePlan: 'Mensual', tipoPlan: TipoPlan.MENSUAL, cantidadClases: null,
    fechaInicioSolicitada: dia('2026-11-01'), fechaInicio: dia('2026-11-01'), fechaVencimiento: dia('2026-11-30'), tiposClaseIds: [],
    ...datos,
});

describe('H11. Alerta de membresía vencida', () => {
    const repo = { findMiembro: vi.fn(), findAbiertoDeMiembro: vi.fn(), crearIngreso: vi.fn() };
    const estados = { obtenerEstado: vi.fn() };
    const service = new AccesosService(repo as unknown as RegistroAccesoRepository, estados as unknown as EstadoMembresiaService);

    beforeEach(() => {
        vi.resetAllMocks();
        repo.findMiembro.mockResolvedValue(miembro);
        repo.findAbiertoDeMiembro.mockResolvedValue(null);
        repo.crearIngreso.mockImplementation((datos) => Promise.resolve({ id: 'a1', ...datos }));
    });

    it('AC1: la búsqueda muestra el estado de la membresía y la fecha de vencimiento', async () => {
        const miembrosRepo = { buscar: vi.fn().mockResolvedValue([{ id: 'm1', nombre: 'María', apellido: 'López', codigo: 'MBR-000002', documento: '01234567-8' }]) };
        const estadosDe = { estadosDe: vi.fn().mockResolvedValue(new Map()) };
        const busqueda = new MiembrosService(miembrosRepo as unknown as MiembroRepository, estadosDe as unknown as EstadoMembresiaService);

        // Sin datos de membresía el estado es "Sin membresía".
        await expect(busqueda.buscar('María', Rol.RECEPCION)).resolves.toEqual([
            expect.objectContaining({ estadoMembresia: 'SIN_MEMBRESIA', fechaVencimiento: null }),
        ]);
    });

    it('AC2: con 3 días o menos para vencer está "Próxima a vencer" y entra normal', async () => {
        expect(calcularEstadoMembresia([membresia()], '2026-11-28')).toMatchObject({ estado: 'PROXIMA_A_VENCER', diasRestantes: 2 });
        expect(requiereMotivo('PROXIMA_A_VENCER')).toBe(false);

        estados.obtenerEstado.mockResolvedValue({ estado: 'PROXIMA_A_VENCER' });
        await expect(service.registrarIngreso('r1', { miembroId: 'm1' }, AHORA)).resolves.toMatchObject({ estadoMembresia: 'PROXIMA_A_VENCER' });
    });

    it('AC3: vencida, pendiente de pago o sin membresía exigen la excepción (alerta roja)', () => {
        for (const estado of ['VENCIDA', 'PENDIENTE_PAGO', 'SIN_MEMBRESIA'] as const) {
            expect(requiereMotivo(estado)).toBe(true);
        }
        expect(requiereMotivo('VIGENTE')).toBe(false);
    });

    it('AC4: con un motivo de 10 a 250 caracteres el ingreso se registra y guarda el motivo con el usuario', async () => {
        estados.obtenerEstado.mockResolvedValue({ estado: 'VENCIDA' });

        await service.registrarIngreso('recepcion-1', { miembroId: 'm1', motivoExcepcion: '  Paga mañana en recepción  ' }, AHORA);

        expect(repo.crearIngreso).toHaveBeenCalledWith(expect.objectContaining({
            estadoMembresia: 'VENCIDA', motivoExcepcion: 'Paga mañana en recepción', registradoPorId: 'recepcion-1',
        }));
        expect(motivoValido('x'.repeat(10))).toBe(true);
        expect(motivoValido('x'.repeat(251))).toBe(false);
    });

    it('AC5: sin motivo se rechaza con "Se requiere un motivo de excepción" aunque la petición no venga de la pantalla', async () => {
        estados.obtenerEstado.mockResolvedValue({ estado: 'SIN_MEMBRESIA' });

        for (const motivoExcepcion of [undefined, '', 'corto']) {
            await expect(service.registrarIngreso('r1', { miembroId: 'm1', motivoExcepcion }, AHORA)).rejects.toThrow(
                new ConflictException('Se requiere un motivo de excepción'),
            );
        }
        expect(repo.crearIngreso).not.toHaveBeenCalled();
    });

    it('AC6: un Daypass está "Vigente" el día del pago y "Vencida" al día siguiente', () => {
        const daypass = membresia({ tipoPlan: TipoPlan.DAYPASS, fechaInicio: dia('2026-11-16'), fechaVencimiento: dia('2026-11-16') });

        expect(calcularEstadoMembresia([daypass], '2026-11-16').estado).toBe('VIGENTE');
        expect(calcularEstadoMembresia([daypass], '2026-11-17').estado).toBe('VENCIDA');
    });
});
