import { ConflictException } from '@nestjs/common';
import type { RegistroAccesoRepository } from '@Accesos/repositories';
import { RegistroAccesoRepository as RepositorioReal } from '@Accesos/repositories';
import { AccesosController } from '@Accesos/controllers';
import type { EstadoMembresiaService } from '@Membresias/services';
import type { MiembroRepository } from '@Miembros/repositories';
import { MiembrosService } from '@Miembros/services';
import type { PrismaService } from '@Prisma/services';
import { EstadoAcceso, Rol } from '@PrismaClient';
import { rolesPermitidos } from '../../../test/helpers/roles.js';
import { AccesosService, MENSAJES_ACCESO } from './accesos.service.js';
import { CRON_CIERRE_AUTOMATICO, CierreAutomaticoService } from './cierre-automatico.service.js';

const AHORA = new Date('2026-11-16T15:00:00Z'); // lunes 09:00 en El Salvador
const miembro = { id: 'm1', codigoMiembro: 'MBR-000002', usuario: { nombre: 'María', apellido: 'López' } };

describe('H10. Registro de ingreso y salida de un miembro', () => {
    const repo = {
        findMiembro: vi.fn(), findAbiertoDeMiembro: vi.fn(), crearIngreso: vi.fn(), findById: vi.fn(),
        registrarSalida: vi.fn(), findEntre: vi.fn(), cerrarAbiertosDelDia: vi.fn(),
    };
    const estados = { obtenerEstado: vi.fn() };
    const service = new AccesosService(repo as unknown as RegistroAccesoRepository, estados as unknown as EstadoMembresiaService);

    beforeEach(() => {
        vi.resetAllMocks();
        repo.findMiembro.mockResolvedValue(miembro);
        repo.findAbiertoDeMiembro.mockResolvedValue(null);
        estados.obtenerEstado.mockResolvedValue({ estado: 'VIGENTE' });
        repo.crearIngreso.mockImplementation((datos) => Promise.resolve({ id: 'a1', ...datos }));
    });

    it('AC1: recepción busca al miembro por nombre, documento o código y ve el estado de su membresía', async () => {
        const miembrosRepo = { buscar: vi.fn().mockResolvedValue([{ id: 'm1', nombre: 'María', apellido: 'López', codigo: 'MBR-000002', documento: '01234567-8' }]) };
        const estadosDe = { estadosDe: vi.fn().mockResolvedValue(new Map([['m1', { estado: 'VENCIDA', fechaVencimiento: '2026-11-10' }]])) };
        const busqueda = new MiembrosService(miembrosRepo as unknown as MiembroRepository, estadosDe as unknown as EstadoMembresiaService);

        await expect(busqueda.buscar('01234567-8', Rol.RECEPCION)).resolves.toEqual([
            expect.objectContaining({ codigo: 'MBR-000002', estadoMembresia: 'VENCIDA', fechaVencimiento: '2026-11-10' }),
        ]);
    });

    it('AC2: un ingreso queda "Dentro" con el miembro, la fecha y hora y el usuario de recepción', async () => {
        const res = await service.registrarIngreso('recepcion-1', { miembroId: 'm1' }, AHORA);

        expect(res).toMatchObject({ id: 'a1', estado: EstadoAcceso.DENTRO, ingresoEn: AHORA, miembro: { id: 'm1', codigo: 'MBR-000002' } });
        expect(repo.crearIngreso).toHaveBeenCalledWith(expect.objectContaining({ miembroId: 'm1', ingresoEn: AHORA, registradoPorId: 'recepcion-1' }));
    });

    it('AC3: la salida cierra el mismo registro como "Salió" con la hora y el usuario', async () => {
        const salida = new Date('2026-11-16T17:00:00Z');
        repo.findById.mockResolvedValue({ id: 'a1' });
        repo.registrarSalida.mockResolvedValue({ id: 'a1', salidaEn: salida });

        await expect(service.registrarSalida('recepcion-2', 'a1', salida)).resolves.toEqual({ id: 'a1', salidaEn: salida, estado: EstadoAcceso.SALIO });
        expect(repo.registrarSalida).toHaveBeenCalledWith('a1', 'recepcion-2', salida);
    });

    it('AC4: el ingreso devuelve el registro creado para actualizar la lista sin recargar', async () => {
        const res = await service.registrarIngreso('recepcion-1', { miembroId: 'm1' }, AHORA);
        expect(res).toEqual(expect.objectContaining({ id: 'a1', ingresoEn: AHORA, estado: EstadoAcceso.DENTRO }));
    });

    it('AC5: la lista del día trae nombre, código, horas y estado, con el ingreso más reciente primero', async () => {
        repo.findEntre.mockResolvedValue([
            { id: 'a2', ingresoEn: AHORA, salidaEn: null, estado: EstadoAcceso.DENTRO, miembro },
        ]);
        await expect(service.listarHoy(AHORA)).resolves.toEqual([
            { id: 'a2', miembro: { nombre: 'María López', codigo: 'MBR-000002' }, ingresoEn: AHORA, salidaEn: null, estado: EstadoAcceso.DENTRO },
        ]);
        expect(repo.findEntre).toHaveBeenCalledWith(new Date('2026-11-16T06:00:00Z'), new Date('2026-11-17T06:00:00Z'));

        const prisma = { registroAcceso: { findMany: vi.fn().mockResolvedValue([]) } };
        await new RepositorioReal(prisma as unknown as PrismaService).findEntre(AHORA, AHORA);
        expect(prisma.registroAcceso.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { ingresoEn: 'desc' } }));
    });

    it('AC6: a las 23:59 (UTC-6) los ingresos sin salida del día quedan "Cerrado automáticamente"', async () => {
        repo.cerrarAbiertosDelDia.mockResolvedValue(2);
        const cierre = new CierreAutomaticoService(repo as unknown as RegistroAccesoRepository);

        await expect(cierre.cerrarIngresosDelDia(new Date('2026-11-17T05:59:00Z'))).resolves.toBe(2);
        expect(repo.cerrarAbiertosDelDia).toHaveBeenCalledWith(new Date('2026-11-16T06:00:00Z'), new Date('2026-11-17T05:59:00Z'));
        expect(CRON_CIERRE_AUTOMATICO).toBe('59 23 * * *');
    });

    it('AC7: rechaza un segundo ingreso de alguien que está dentro y la salida de alguien sin ingreso abierto', async () => {
        repo.findAbiertoDeMiembro.mockResolvedValue({ id: 'a1' });
        await expect(service.registrarIngreso('r1', { miembroId: 'm1' }, AHORA)).rejects.toThrow(
            new ConflictException('El miembro ya está dentro del gimnasio'),
        );

        repo.findById.mockResolvedValue({ id: 'a1' });
        repo.registrarSalida.mockResolvedValue(null);
        await expect(service.registrarSalida('r1', 'a1', AHORA)).rejects.toThrow(new ConflictException(MENSAJES_ACCESO.SIN_INGRESO));
        expect(repo.crearIngreso).not.toHaveBeenCalled();
    });

    it('AC8: miembros y entrenadores no pueden registrar ingresos ni salidas', () => {
        expect(rolesPermitidos(AccesosController, 'registrarIngreso')).toEqual([Rol.RECEPCION]);
        expect(rolesPermitidos(AccesosController, 'registrarSalida')).toEqual([Rol.RECEPCION]);
    });
});
