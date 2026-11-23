import type { PrismaService } from '@Prisma/services';
import { EstadoMaquina, Rol, TipoMaquina, ZonaMaquina } from '@PrismaClient';
import { rolesPermitidos } from '../../../test/helpers/roles.js';
import { MaquinasController } from '../controllers/maquinas.controller.js';
import { MaquinaRepository, type MaquinaConUltimoCambio } from '../repositories/maquina.repository.js';
import { MaquinasService } from './maquinas.service.js';

const maquina = (codigo: string, estado: EstadoMaquina, fecha: string | null = null): MaquinaConUltimoCambio => ({
    id: `id-${codigo}`, codigo, nombre: `Máquina ${codigo}`, tipo: TipoMaquina.CARDIO, zona: ZonaMaquina.PISO_1, estado,
    fechaEstimadaRetorno: fecha ? new Date(`${fecha}T00:00:00Z`) : null, ultimoMotivo: 'Banda desgastada',
    ultimoCambioPorId: 'u1', actualizadoEn: new Date(), ultimoCambioPor: { id: 'u1', nombre: 'Ana', apellido: 'Paz' },
}) as MaquinaConUltimoCambio;

describe('H17. Consulta del estado de las máquinas', () => {
    const repo = { findTodas: vi.fn(), contarPorEstado: vi.fn() };
    const service = new MaquinasService(repo as unknown as MaquinaRepository);
    const resumen = { OPERATIVA: 1, EN_MANTENIMIENTO: 1, FUERA_DE_SERVICIO: 1 };

    beforeEach(() => {
        vi.resetAllMocks();
        repo.findTodas.mockResolvedValue([
            maquina('MAQ-001', EstadoMaquina.OPERATIVA), maquina('MAQ-002', EstadoMaquina.EN_MANTENIMIENTO, '2026-12-01'),
            maquina('MAQ-003', EstadoMaquina.FUERA_DE_SERVICIO),
        ]);
        repo.contarPorEstado.mockResolvedValue(resumen);
    });

    it('AC1: lista cada máquina con nombre, tipo, zona y estado, más el resumen por estado', async () => {
        const res = await service.listar(Rol.MIEMBRO, {});

        expect(res.resumen).toEqual(resumen);
        expect(res.maquinas[0]).toMatchObject({ nombre: 'Máquina MAQ-001', tipo: 'CARDIO', zona: 'PISO_1', estado: 'OPERATIVA' });
        expect(rolesPermitidos(MaquinasController, 'listar')).toEqual(Object.values(Rol));
    });

    it('AC2: los filtros de estado, tipo y zona se combinan (deben cumplirse todos)', async () => {
        const prisma = { maquina: { findMany: vi.fn().mockResolvedValue([]) } };
        await new MaquinaRepository(prisma as unknown as PrismaService).findTodas({
            estado: EstadoMaquina.OPERATIVA, tipo: TipoMaquina.FUERZA, zona: ZonaMaquina.PISO_2,
        });

        expect(prisma.maquina.findMany.mock.calls[0][0].where).toEqual({ estado: 'OPERATIVA', tipo: 'FUERZA', zona: 'PISO_2' });
    });

    it('AC3: una máquina no operativa trae su fecha estimada de retorno o null ("Sin fecha estimada")', async () => {
        const { maquinas } = await service.listar(Rol.MIEMBRO, {});

        expect(maquinas.map((m) => m.fechaEstimadaRetorno)).toEqual([null, '2026-12-01', null]);
    });

    it('AC4: si ningún resultado cumple los filtros la lista viene vacía', async () => {
        repo.findTodas.mockResolvedValue([]);

        const res = await service.listar(Rol.MIEMBRO, { tipo: TipoMaquina.FUNCIONAL });

        expect(res.maquinas).toEqual([]);
    });

    it('AC5: el miembro no recibe el motivo interno ni quién hizo el cambio, y no puede cambiar estados', async () => {
        const miembro = await service.listar(Rol.MIEMBRO, {});
        expect(miembro.maquinas[0]).not.toHaveProperty('ultimoMotivo');
        expect(miembro.maquinas[0]).not.toHaveProperty('ultimoCambioPor');

        const admin = await service.listar(Rol.ADMINISTRADOR, {});
        expect(admin.maquinas[0]).toHaveProperty('ultimoMotivo', 'Banda desgastada');

        expect(rolesPermitidos(MaquinasController, 'cambiarEstado')).not.toContain(Rol.MIEMBRO);
    });
});
