import type { EstadoMembresiaService } from '@Membresias/services';
import type { MiembroRepository } from '@Miembros/repositories';
import { Rol } from '@PrismaClient';
import { MiembrosService } from './miembros.service.js';

const maria = { id: 'm1', nombre: 'María', apellido: 'López', codigo: 'MBR-000001', documento: '01234567-8' };
const pedro = { id: 'm2', nombre: 'Pedro', apellido: 'Núñez', codigo: 'MBR-000002', documento: '02345678-9' };

describe('MiembrosService.buscar', () => {
    const repo = { buscar: vi.fn() };
    const estados = { estadosDe: vi.fn() };
    const service = new MiembrosService(
        repo as unknown as MiembroRepository,
        estados as unknown as EstadoMembresiaService,
    );

    beforeEach(() => {
        vi.resetAllMocks();
        repo.buscar.mockResolvedValue([maria, pedro]);
        estados.estadosDe.mockResolvedValue(
            new Map([
                ['m1', { estado: 'ACTIVA', fechaVencimiento: '2026-11-30' }],
                ['m2', { estado: 'SIN_MEMBRESIA', fechaVencimiento: null }],
            ]),
        );
    });

    it('busca con el texto normalizado y escapado, y con el texto exacto', async () => {
        await service.buscar('  JOSÉ_50% ', Rol.RECEPCION);
        expect(repo.buscar).toHaveBeenCalledWith('jose\\_50\\%', 'JOSÉ_50%');
    });

    it.each([Rol.RECEPCION, Rol.ADMINISTRADOR])('%s recibe documento, estado y vencimiento', async (rol) => {
        const lista = await service.buscar('maria', rol);
        expect(estados.estadosDe).toHaveBeenCalledWith(['m1', 'm2']);
        expect(lista).toEqual([
            { ...maria, estadoMembresia: 'ACTIVA', fechaVencimiento: '2026-11-30' },
            { ...pedro, estadoMembresia: 'SIN_MEMBRESIA', fechaVencimiento: null },
        ]);
    });

    it('ENTRENADOR no recibe documento, estado ni vencimiento, y no se consulta el estado', async () => {
        const lista = await service.buscar('maria', Rol.ENTRENADOR);
        expect(lista).toEqual([
            { id: 'm1', nombre: 'María', apellido: 'López', codigo: 'MBR-000001' },
            { id: 'm2', nombre: 'Pedro', apellido: 'Núñez', codigo: 'MBR-000002' },
        ]);
        expect(lista[0]).not.toHaveProperty('documento');
        expect(estados.estadosDe).not.toHaveBeenCalled();
    });
});
