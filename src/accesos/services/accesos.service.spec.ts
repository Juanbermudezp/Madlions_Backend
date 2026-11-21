import { ConflictException, NotFoundException } from '@nestjs/common';
import { MiembroDentroError } from '@Accesos/errors';
import type { RegistroAccesoRepository } from '@Accesos/repositories';
import type { EstadoMembresiaService } from '@Membresias/services';
import { EstadoAcceso, type RegistroAcceso } from '@PrismaClient';
import { AccesosService, MENSAJES_ACCESO } from './accesos.service.js';

const AHORA = new Date('2026-11-16T15:00:00Z'); // 09:00 en El Salvador

const miembro = {
    id: 'm1',
    codigoMiembro: 'MBR-000001',
    usuario: { nombre: 'María', apellido: 'López' },
};

function registro(datos: Partial<RegistroAcceso> = {}): RegistroAcceso {
    return {
        id: 'r1',
        miembroId: 'm1',
        ingresoEn: AHORA,
        salidaEn: null,
        estado: EstadoAcceso.DENTRO,
        registradoPorId: 'rec1',
        salidaRegistradaPorId: null,
        estadoMembresia: 'VIGENTE',
        motivoExcepcion: null,
        ...datos,
    };
}

describe('AccesosService', () => {
    const repo = {
        findMiembro: vi.fn(),
        findAbiertoDeMiembro: vi.fn(),
        findById: vi.fn(),
        crearIngreso: vi.fn(),
        registrarSalida: vi.fn(),
        findEntre: vi.fn(),
    };
    const estadoMembresiaService = { obtenerEstado: vi.fn() };
    const service = new AccesosService(
        repo as unknown as RegistroAccesoRepository,
        estadoMembresiaService as unknown as EstadoMembresiaService,
    );

    beforeEach(() => {
        vi.resetAllMocks();
        repo.findMiembro.mockResolvedValue(miembro);
        repo.findAbiertoDeMiembro.mockResolvedValue(null);
        estadoMembresiaService.obtenerEstado.mockResolvedValue({ estado: 'VIGENTE' });
        repo.crearIngreso.mockImplementation((datos: Partial<RegistroAcceso>) => Promise.resolve(registro(datos)));
    });

    describe('registrarIngreso', () => {
        it('crea el ingreso DENTRO con la hora, el usuario de recepción y el estado de la membresía', async () => {
            const respuesta = await service.registrarIngreso('rec1', { miembroId: 'm1' }, AHORA);

            expect(repo.crearIngreso).toHaveBeenCalledWith({
                miembroId: 'm1',
                ingresoEn: AHORA,
                registradoPorId: 'rec1',
                estadoMembresia: 'VIGENTE',
                motivoExcepcion: null,
            });
            expect(estadoMembresiaService.obtenerEstado).toHaveBeenCalledWith('m1', '2026-11-16');
            expect(respuesta).toMatchObject({
                miembro: { id: 'm1', nombre: 'María López', codigo: 'MBR-000001' },
                estado: EstadoAcceso.DENTRO,
                estadoMembresia: 'VIGENTE',
            });
        });

        it('rechaza con 409 si el miembro ya está dentro', async () => {
            repo.findAbiertoDeMiembro.mockResolvedValue(registro());

            await expect(service.registrarIngreso('rec1', { miembroId: 'm1' }, AHORA)).rejects.toThrow(
                new ConflictException(MENSAJES_ACCESO.YA_DENTRO),
            );
            expect(repo.crearIngreso).not.toHaveBeenCalled();
        });

        it('rechaza con 409 si otro recepcionista lo registró al mismo tiempo', async () => {
            repo.crearIngreso.mockRejectedValue(new MiembroDentroError());

            await expect(service.registrarIngreso('rec1', { miembroId: 'm1' }, AHORA)).rejects.toThrow(
                new ConflictException(MENSAJES_ACCESO.YA_DENTRO),
            );
        });

        it('responde 404 si el miembro no existe', async () => {
            repo.findMiembro.mockResolvedValue(null);
            await expect(service.registrarIngreso('rec1', { miembroId: 'x' }, AHORA)).rejects.toThrow(NotFoundException);
        });
    });

    describe('registrarSalida', () => {
        it('pasa el mismo registro a SALIO con la hora y el usuario de la salida', async () => {
            repo.findById.mockResolvedValue(registro());
            repo.registrarSalida.mockResolvedValue(registro({ estado: EstadoAcceso.SALIO, salidaEn: AHORA, salidaRegistradaPorId: 'rec2' }));

            await expect(service.registrarSalida('rec2', 'r1', AHORA)).resolves.toEqual({
                id: 'r1',
                salidaEn: AHORA,
                estado: EstadoAcceso.SALIO,
            });
            expect(repo.registrarSalida).toHaveBeenCalledWith('r1', 'rec2', AHORA);
        });

        it('rechaza con 409 si el registro no tiene un ingreso abierto', async () => {
            repo.findById.mockResolvedValue(registro({ estado: EstadoAcceso.SALIO }));
            repo.registrarSalida.mockResolvedValue(null);

            await expect(service.registrarSalida('rec1', 'r1', AHORA)).rejects.toThrow(
                new ConflictException(MENSAJES_ACCESO.SIN_INGRESO),
            );
        });

        it('responde 404 si el registro no existe', async () => {
            repo.findById.mockResolvedValue(null);
            await expect(service.registrarSalida('rec1', 'x', AHORA)).rejects.toThrow(NotFoundException);
        });
    });

    it('lista los ingresos del día en hora de El Salvador', async () => {
        repo.findEntre.mockResolvedValue([
            { ...registro(), miembro: { codigoMiembro: 'MBR-000001', usuario: { nombre: 'María', apellido: 'López' } } },
        ]);

        const lista = await service.listarHoy(AHORA);

        // 16/11 00:00 a 17/11 00:00 en El Salvador = 06:00 UTC a 06:00 UTC
        expect(repo.findEntre).toHaveBeenCalledWith(
            new Date('2026-11-16T06:00:00Z'),
            new Date('2026-11-17T06:00:00Z'),
        );
        expect(lista).toEqual([
            { id: 'r1', miembro: { nombre: 'María López', codigo: 'MBR-000001' }, ingresoEn: AHORA, salidaEn: null, estado: EstadoAcceso.DENTRO },
        ]);
    });

    describe('registrarIngreso según el estado de la membresía (H11)', () => {
        const MOTIVO = 'Pagará mañana en recepción';

        it.each(['VIGENTE', 'PROXIMA_A_VENCER', 'POR_INICIAR'])(
            '%s: entra sin motivo y no se guarda motivo',
            async (estado) => {
                estadoMembresiaService.obtenerEstado.mockResolvedValue({ estado });

                await expect(
                    service.registrarIngreso('rec1', { miembroId: 'm1', motivoExcepcion: MOTIVO }, AHORA),
                ).resolves.toMatchObject({ estadoMembresia: estado });
                expect(repo.crearIngreso).toHaveBeenCalledWith(
                    expect.objectContaining({ estadoMembresia: estado, motivoExcepcion: null }),
                );
            },
        );

        it.each(['VENCIDA', 'PENDIENTE_PAGO', 'SIN_MEMBRESIA'])(
            '%s: sin motivo responde 409 y no registra',
            async (estado) => {
                estadoMembresiaService.obtenerEstado.mockResolvedValue({ estado });

                await expect(service.registrarIngreso('rec1', { miembroId: 'm1' }, AHORA)).rejects.toThrow(
                    new ConflictException(MENSAJES_ACCESO.MOTIVO_REQUERIDO),
                );
                expect(repo.crearIngreso).not.toHaveBeenCalled();
            },
        );

        it.each(['VENCIDA', 'PENDIENTE_PAGO', 'SIN_MEMBRESIA'])(
            '%s: con un motivo de 9 caracteres (sin contar espacios) responde 409',
            async (estado) => {
                estadoMembresiaService.obtenerEstado.mockResolvedValue({ estado });

                await expect(
                    service.registrarIngreso('rec1', { miembroId: 'm1', motivoExcepcion: '  123456789  ' }, AHORA),
                ).rejects.toThrow(new ConflictException(MENSAJES_ACCESO.MOTIVO_REQUERIDO));
            },
        );

        it.each(['VENCIDA', 'PENDIENTE_PAGO', 'SIN_MEMBRESIA'])(
            '%s: con motivo válido registra el ingreso y guarda el motivo con el usuario de recepción',
            async (estado) => {
                estadoMembresiaService.obtenerEstado.mockResolvedValue({ estado });

                await service.registrarIngreso('rec1', { miembroId: 'm1', motivoExcepcion: `  ${MOTIVO}  ` }, AHORA);

                expect(repo.crearIngreso).toHaveBeenCalledWith({
                    miembroId: 'm1',
                    ingresoEn: AHORA,
                    registradoPorId: 'rec1',
                    estadoMembresia: estado,
                    motivoExcepcion: MOTIVO,
                });
            },
        );

        it('el estado se calcula en el servidor para el día del ingreso', async () => {
            await service.registrarIngreso('rec1', { miembroId: 'm1' }, AHORA);
            expect(estadoMembresiaService.obtenerEstado).toHaveBeenCalledWith('m1', '2026-11-16');
        });
    });
});