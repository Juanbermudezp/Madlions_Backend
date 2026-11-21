import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type {
    CambioConUsuario,
    MaquinaConUltimoCambio,
    MaquinaRepository,
} from '@Maquinas/repositories';
import { EstadoMaquina, Rol, TipoMaquina, ZonaMaquina } from '@PrismaClient';
import {
    MaquinasService,
    MAQUINA_NO_EXISTE,
    MAQUINA_YA_EN_ESE_ESTADO,
} from './maquinas.service.js';
import { FECHA_RETORNO_EN_OPERATIVA, FECHA_RETORNO_PASADA } from './reglas-maquina.js';

function maquina(datos: Partial<MaquinaConUltimoCambio> = {}): MaquinaConUltimoCambio {
    return {
        id: 'm1',
        codigo: 'MAQ-001',
        nombre: 'Caminadora 1',
        tipo: TipoMaquina.CARDIO,
        zona: ZonaMaquina.PISO_1,
        estado: EstadoMaquina.EN_MANTENIMIENTO,
        fechaEstimadaRetorno: new Date('2026-11-20T00:00:00Z'),
        ultimoMotivo: 'Banda desgastada, se espera repuesto.',
        ultimoCambioPorId: 'u1',
        ultimoCambioPor: { id: 'u1', nombre: 'Alberto', apellido: 'Ramírez' },
        actualizadoEn: new Date('2026-11-15T12:00:00Z'),
        ...datos,
    };
}

const RESUMEN = {
    [EstadoMaquina.OPERATIVA]: 10,
    [EstadoMaquina.EN_MANTENIMIENTO]: 1,
    [EstadoMaquina.FUERA_DE_SERVICIO]: 1,
};

describe('MaquinasService', () => {
    const repo = {
        findTodas: vi.fn(),
        contarPorEstado: vi.fn(),
        findById: vi.fn(),
        cambiarEstado: vi.fn(),
        findHistorial: vi.fn(),
    };
    const service = new MaquinasService(repo as unknown as MaquinaRepository);

    beforeEach(() => {
        vi.resetAllMocks();
        repo.findTodas.mockResolvedValue([maquina()]);
        repo.contarPorEstado.mockResolvedValue(RESUMEN);
    });

    describe('datos internos según el rol', () => {
        it('el miembro no recibe el motivo ni quién hizo el último cambio', async () => {
            const { maquinas } = await service.listar(Rol.MIEMBRO, {});

            expect(maquinas[0]).not.toHaveProperty('ultimoMotivo');
            expect(maquinas[0]).not.toHaveProperty('ultimoCambioPor');
            expect(JSON.stringify(maquinas[0])).not.toContain('ultimoMotivo');
            expect(JSON.stringify(maquinas[0])).not.toContain('Alberto');
        });

        it('recepción tampoco los recibe', async () => {
            const { maquinas } = await service.listar(Rol.RECEPCION, {});

            expect(maquinas[0]).not.toHaveProperty('ultimoMotivo');
            expect(maquinas[0]).not.toHaveProperty('ultimoCambioPor');
        });

        it('el administrador y el entrenador sí los reciben', async () => {
            for (const rol of [Rol.ADMINISTRADOR, Rol.ENTRENADOR]) {
                const { maquinas } = await service.listar(rol, {});

                expect(maquinas[0]).toMatchObject({
                    ultimoMotivo: 'Banda desgastada, se espera repuesto.',
                    ultimoCambioPor: { id: 'u1', nombre: 'Alberto', apellido: 'Ramírez' },
                });
            }
        });

        it('todos los roles reciben los datos públicos y la fecha estimada', async () => {
            const { maquinas } = await service.listar(Rol.MIEMBRO, {});

            expect(maquinas[0]).toMatchObject({
                id: 'm1',
                codigo: 'MAQ-001',
                nombre: 'Caminadora 1',
                tipo: TipoMaquina.CARDIO,
                zona: ZonaMaquina.PISO_1,
                estado: EstadoMaquina.EN_MANTENIMIENTO,
                fechaEstimadaRetorno: '2026-11-20',
            });
        });
    });

    describe('filtros y resumen', () => {
        it('pasa los tres filtros al listado', async () => {
            const filtros = {
                estado: EstadoMaquina.OPERATIVA,
                tipo: TipoMaquina.FUERZA,
                zona: ZonaMaquina.PISO_2,
            };

            await service.listar(Rol.MIEMBRO, filtros);

            expect(repo.findTodas).toHaveBeenCalledWith(filtros);
        });

        it('cuenta el resumen sin el filtro de estado, para no dejar los otros contadores en 0', async () => {
            await service.listar(Rol.MIEMBRO, {
                estado: EstadoMaquina.EN_MANTENIMIENTO,
                tipo: TipoMaquina.CARDIO,
                zona: ZonaMaquina.PISO_1,
            });

            expect(repo.contarPorEstado).toHaveBeenCalledWith({
                tipo: TipoMaquina.CARDIO,
                zona: ZonaMaquina.PISO_1,
            });
        });

        it('devuelve el resumen con los tres estados', async () => {
            const { resumen } = await service.listar(Rol.MIEMBRO, {});

            expect(resumen).toEqual(RESUMEN);
        });

        it('devuelve la lista vacía cuando ningún resultado cumple los filtros', async () => {
            repo.findTodas.mockResolvedValue([]);

            const { maquinas, resumen } = await service.listar(Rol.MIEMBRO, {
                zona: ZonaMaquina.AREA_FUNCIONAL,
            });

            expect(maquinas).toEqual([]);
            expect(resumen).toEqual(RESUMEN);
        });
    });

    describe('cambiarEstado (H18)', () => {
        const HOY = new Date('2026-11-18T18:00:00Z');
        const CAMBIO = {
            estado: EstadoMaquina.EN_MANTENIMIENTO,
            motivo: 'Banda desgastada, se espera el repuesto.',
        };

        beforeEach(() => {
            vi.useFakeTimers();
            vi.setSystemTime(HOY);
            repo.findById.mockResolvedValue(maquina({ estado: EstadoMaquina.OPERATIVA }));
            repo.cambiarEstado.mockResolvedValue(maquina());
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('registra el cambio con el estado anterior, el motivo y el usuario', async () => {
            await service.cambiarEstado('m1', 'u9', CAMBIO);

            expect(repo.cambiarEstado).toHaveBeenCalledWith({
                maquinaId: 'm1',
                estadoAnterior: EstadoMaquina.OPERATIVA,
                estadoNuevo: EstadoMaquina.EN_MANTENIMIENTO,
                motivo: CAMBIO.motivo,
                fechaEstimadaRetorno: null,
                usuarioId: 'u9',
            });
        });

        it('guarda la fecha estimada cuando se envía', async () => {
            await service.cambiarEstado('m1', 'u9', {
                ...CAMBIO,
                fechaEstimadaRetorno: '2026-12-01',
            });

            expect(repo.cambiarEstado).toHaveBeenCalledWith(
                expect.objectContaining({
                    fechaEstimadaRetorno: new Date('2026-12-01T00:00:00Z'),
                }),
            );
        });

        it('borra la fecha estimada al volver a OPERATIVA (criterio 2)', async () => {
            repo.findById.mockResolvedValue(
                maquina({ estado: EstadoMaquina.EN_MANTENIMIENTO }),
            );

            await service.cambiarEstado('m1', 'u9', {
                estado: EstadoMaquina.OPERATIVA,
                motivo: 'Repuesto instalado, la máquina quedó probada.',
            });

            expect(repo.cambiarEstado).toHaveBeenCalledWith(
                expect.objectContaining({
                    estadoNuevo: EstadoMaquina.OPERATIVA,
                    fechaEstimadaRetorno: null,
                }),
            );
        });

        it('devuelve la máquina con los datos internos del cambio', async () => {
            const actualizada = await service.cambiarEstado('m1', 'u9', CAMBIO);

            expect(actualizada).toMatchObject({
                estado: EstadoMaquina.EN_MANTENIMIENTO,
                ultimoMotivo: 'Banda desgastada, se espera repuesto.',
                ultimoCambioPor: { id: 'u1', nombre: 'Alberto', apellido: 'Ramírez' },
            });
        });

        it('404 si la máquina no existe', async () => {
            repo.findById.mockResolvedValue(null);

            await expect(service.cambiarEstado('m1', 'u9', CAMBIO)).rejects.toThrow(
                new NotFoundException(MAQUINA_NO_EXISTE),
            );
            expect(repo.cambiarEstado).not.toHaveBeenCalled();
        });

        it('409 si ya está en ese estado (criterio 4)', async () => {
            repo.findById.mockResolvedValue(
                maquina({ estado: EstadoMaquina.EN_MANTENIMIENTO }),
            );

            await expect(service.cambiarEstado('m1', 'u9', CAMBIO)).rejects.toThrow(
                new ConflictException(MAQUINA_YA_EN_ESE_ESTADO),
            );
            expect(repo.cambiarEstado).not.toHaveBeenCalled();
        });

        it('400 con una fecha estimada anterior a hoy (criterio 4)', async () => {
            await expect(
                service.cambiarEstado('m1', 'u9', {
                    ...CAMBIO,
                    fechaEstimadaRetorno: '2026-11-17',
                }),
            ).rejects.toThrow(new BadRequestException(FECHA_RETORNO_PASADA));
            expect(repo.cambiarEstado).not.toHaveBeenCalled();
        });

        it('acepta la fecha estimada de hoy', async () => {
            await service.cambiarEstado('m1', 'u9', {
                ...CAMBIO,
                fechaEstimadaRetorno: '2026-11-18',
            });

            expect(repo.cambiarEstado).toHaveBeenCalled();
        });

        it('400 con fecha estimada al volver a OPERATIVA (criterio 4)', async () => {
            repo.findById.mockResolvedValue(
                maquina({ estado: EstadoMaquina.EN_MANTENIMIENTO }),
            );

            await expect(
                service.cambiarEstado('m1', 'u9', {
                    estado: EstadoMaquina.OPERATIVA,
                    motivo: 'Repuesto instalado, la máquina quedó probada.',
                    fechaEstimadaRetorno: '2026-12-01',
                }),
            ).rejects.toThrow(new BadRequestException(FECHA_RETORNO_EN_OPERATIVA));
            expect(repo.cambiarEstado).not.toHaveBeenCalled();
        });

        it('409 si otra petición le ganó el cambio', async () => {
            repo.cambiarEstado.mockResolvedValue(null);

            await expect(service.cambiarEstado('m1', 'u9', CAMBIO)).rejects.toThrow(
                new ConflictException(MAQUINA_YA_EN_ESE_ESTADO),
            );
        });
    });

    describe('historial (H18)', () => {
        const cambio = (datos: Partial<CambioConUsuario> = {}): CambioConUsuario => ({
            id: 'h1',
            maquinaId: 'm1',
            estadoAnterior: EstadoMaquina.OPERATIVA,
            estadoNuevo: EstadoMaquina.EN_MANTENIMIENTO,
            motivo: 'Banda desgastada, se espera el repuesto.',
            fechaEstimadaRetorno: new Date('2026-12-01T00:00:00Z'),
            cambiadoPorId: 'u1',
            cambiadoPor: { id: 'u1', nombre: 'Alberto', apellido: 'Ramírez' },
            cambiadoEn: new Date('2026-11-18T15:20:13.440Z'),
            ...datos,
        });

        beforeEach(() => {
            repo.findById.mockResolvedValue(maquina());
            repo.findHistorial.mockResolvedValue([cambio()]);
        });

        it('devuelve cada cambio con fecha, hora, estados, motivo y usuario (criterio 3)', async () => {
            const [primero] = await service.historial('m1');

            expect(primero).toEqual({
                id: 'h1',
                estadoAnterior: EstadoMaquina.OPERATIVA,
                estadoNuevo: EstadoMaquina.EN_MANTENIMIENTO,
                motivo: 'Banda desgastada, se espera el repuesto.',
                fechaEstimadaRetorno: '2026-12-01',
                usuario: { id: 'u1', nombre: 'Alberto', apellido: 'Ramírez' },
                cambiadoEn: '2026-11-18T15:20:13.440Z',
            });
        });

        it('deja la fecha estimada en null cuando el cambio no la tuvo', async () => {
            repo.findHistorial.mockResolvedValue([cambio({ fechaEstimadaRetorno: null })]);

            const [primero] = await service.historial('m1');

            expect(primero.fechaEstimadaRetorno).toBeNull();
        });

        it('404 si la máquina no existe', async () => {
            repo.findById.mockResolvedValue(null);

            await expect(service.historial('m1')).rejects.toThrow(
                new NotFoundException(MAQUINA_NO_EXISTE),
            );
            expect(repo.findHistorial).not.toHaveBeenCalled();
        });

        it('una máquina que nunca cambió de estado tiene el historial vacío', async () => {
            repo.findHistorial.mockResolvedValue([]);

            expect(await service.historial('m1')).toEqual([]);
        });
    });

});
