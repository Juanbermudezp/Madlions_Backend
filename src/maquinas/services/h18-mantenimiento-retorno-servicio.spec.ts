import { BadRequestException, ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { PrismaService } from '@Prisma/services';
import { EstadoMaquina, Rol, TipoMaquina, ZonaMaquina } from '@PrismaClient';
import { rolesPermitidos } from '../../../test/helpers/roles.js';
import { MaquinasController } from '../controllers/maquinas.controller.js';
import { CambiarEstadoMaquinaDto } from '../dto/index.js';
import { MaquinaRepository, type CambioConUsuario, type MaquinaConUltimoCambio } from '../repositories/maquina.repository.js';
import { MaquinasService } from './maquinas.service.js';

const maquina = (estado: EstadoMaquina, fecha: string | null = null) => ({
    id: 'maq1', codigo: 'MAQ-001', nombre: 'Caminadora', tipo: TipoMaquina.CARDIO, zona: ZonaMaquina.PISO_1, estado,
    fechaEstimadaRetorno: fecha ? new Date(`${fecha}T00:00:00Z`) : null, ultimoMotivo: null, ultimoCambioPorId: null,
    actualizadoEn: new Date(), ultimoCambioPor: null,
}) as MaquinaConUltimoCambio;
const cambio = (id: string, cambiadoEn: string): CambioConUsuario => ({
    id, maquinaId: 'maq1', estadoAnterior: EstadoMaquina.OPERATIVA, estadoNuevo: EstadoMaquina.EN_MANTENIMIENTO,
    motivo: 'Revisión preventiva', fechaEstimadaRetorno: null, cambiadoPorId: 'u1', cambiadoEn: new Date(cambiadoEn),
    cambiadoPor: { id: 'u1', nombre: 'Ana', apellido: 'Paz' },
});

describe('H18. Registro de mantenimiento y retorno a servicio', () => {
    const repo = { findById: vi.fn(), cambiarEstado: vi.fn(), findHistorial: vi.fn() };
    const service = new MaquinasService(repo as unknown as MaquinaRepository);

    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-11-21T18:00:00Z'));
        vi.resetAllMocks();
        repo.findById.mockResolvedValue(maquina(EstadoMaquina.OPERATIVA));
        repo.cambiarEstado.mockImplementation((d: { estadoNuevo: EstadoMaquina; fechaEstimadaRetorno: Date | null }) =>
            Promise.resolve({ ...maquina(d.estadoNuevo), fechaEstimadaRetorno: d.fechaEstimadaRetorno }));
    });
    afterEach(() => vi.useRealTimers());

    it('AC1: administrador o entrenador cambian el estado con motivo de 5 a 250 caracteres y fecha estimada opcional', async () => {
        const dto = { estado: EstadoMaquina.EN_MANTENIMIENTO, motivo: 'Banda desgastada', fechaEstimadaRetorno: '2026-12-01' };
        expect(await validate(plainToInstance(CambiarEstadoMaquinaDto, dto))).toHaveLength(0);

        const res = await service.cambiarEstado('maq1', 'u1', dto);

        expect(res).toMatchObject({ estado: 'EN_MANTENIMIENTO', fechaEstimadaRetorno: '2026-12-01' });
        expect(rolesPermitidos(MaquinasController, 'cambiarEstado').sort()).toEqual([Rol.ADMINISTRADOR, Rol.ENTRENADOR]);
    });

    it('AC2: al volver a "Operativa" se registra el retorno y se borra la fecha estimada', async () => {
        repo.findById.mockResolvedValue(maquina(EstadoMaquina.EN_MANTENIMIENTO, '2026-12-01'));

        const res = await service.cambiarEstado('maq1', 'u1', { estado: EstadoMaquina.OPERATIVA, motivo: 'Reparada' });

        expect(repo.cambiarEstado).toHaveBeenCalledWith(expect.objectContaining({ estadoNuevo: 'OPERATIVA', fechaEstimadaRetorno: null }));
        expect(res.fechaEstimadaRetorno).toBeNull();
    });

    it('AC3: cada cambio queda en el historial con estados, motivo y usuario, del más reciente al más antiguo', async () => {
        const tx = {
            maquina: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), findUniqueOrThrow: vi.fn().mockResolvedValue(maquina(EstadoMaquina.EN_MANTENIMIENTO)) },
            historialMaquina: { create: vi.fn() },
        };
        const prisma = { $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)), historialMaquina: { findMany: vi.fn().mockResolvedValue([]) } };
        const repositorio = new MaquinaRepository(prisma as unknown as PrismaService);
        await repositorio.cambiarEstado({ maquinaId: 'maq1', estadoAnterior: EstadoMaquina.OPERATIVA, estadoNuevo: EstadoMaquina.EN_MANTENIMIENTO, motivo: 'Revisión', fechaEstimadaRetorno: null, usuarioId: 'u1' });
        expect(tx.historialMaquina.create).toHaveBeenCalledWith({ data: expect.objectContaining({ estadoAnterior: 'OPERATIVA', estadoNuevo: 'EN_MANTENIMIENTO', motivo: 'Revisión', cambiadoPorId: 'u1' }) });

        await repositorio.findHistorial('maq1');
        expect(prisma.historialMaquina.findMany.mock.calls[0][0].orderBy).toEqual({ cambiadoEn: 'desc' });

        repo.findHistorial.mockResolvedValue([cambio('h2', '2026-11-20T10:00:00Z'), cambio('h1', '2026-11-10T10:00:00Z')]);
        const historial = await service.historial('maq1');
        expect(historial[0]).toMatchObject({ estadoAnterior: 'OPERATIVA', estadoNuevo: 'EN_MANTENIMIENTO', usuario: { nombre: 'Ana' }, cambiadoEn: '2026-11-20T10:00:00.000Z' });
    });

    it('AC4: rechaza el mismo estado, una fecha estimada pasada o una fecha al pasar a "Operativa"', async () => {
        await expect(service.cambiarEstado('maq1', 'u1', { estado: EstadoMaquina.OPERATIVA, motivo: 'Sin cambio' })).rejects.toBeInstanceOf(ConflictException);
        await expect(service.cambiarEstado('maq1', 'u1', { estado: EstadoMaquina.FUERA_DE_SERVICIO, motivo: 'Motor roto', fechaEstimadaRetorno: '2026-11-20' })).rejects.toBeInstanceOf(BadRequestException);

        repo.findById.mockResolvedValue(maquina(EstadoMaquina.EN_MANTENIMIENTO));
        await expect(service.cambiarEstado('maq1', 'u1', { estado: EstadoMaquina.OPERATIVA, motivo: 'Reparada', fechaEstimadaRetorno: '2026-12-01' })).rejects.toBeInstanceOf(BadRequestException);

        expect(await validate(plainToInstance(CambiarEstadoMaquinaDto, { estado: 'EN_MANTENIMIENTO', motivo: 'Roto' }))).not.toHaveLength(0);
        expect(repo.cambiarEstado).not.toHaveBeenCalled();
    });

    it('AC5: miembro y recepción no cambian el estado ni ven el historial ("Acceso denegado")', () => {
        for (const metodo of ['cambiarEstado', 'historial']) {
            const roles = rolesPermitidos(MaquinasController, metodo);
            expect(roles).not.toContain(Rol.MIEMBRO);
            expect(roles).not.toContain(Rol.RECEPCION);
        }
    });
});
