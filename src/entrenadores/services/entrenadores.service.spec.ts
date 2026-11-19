import { NotFoundException } from '@nestjs/common';
import type { UserRepository } from '@Users/repositories';
import type { BloqueRepository } from '@Bloques/repositories';
import type { ConfiguracionService } from '@Configuracion/services';
import {
    EstadoBloque,
    Rol,
    type BloqueDisponibilidad,
    type User,
} from '@PrismaClient';
import { EntrenadoresService } from './entrenadores.service.js';

const AHORA = new Date('2026-11-16T15:00:00Z');

const entrenador = {
    id: 'e1',
    nombre: 'Carlos',
    apellido: 'Martínez',
    email: 'entrenador@madlions.com',
    rol: Rol.ENTRENADOR,
    isActive: true,
} as User;

const bloque: BloqueDisponibilidad = {
    id: 'b1',
    entrenadorId: 'e1',
    inicio: new Date('2026-11-17T13:00:00Z'),
    fin: new Date('2026-11-17T14:00:00Z'),
    duracionMin: 60,
    estado: EstadoBloque.DISPONIBLE,
    creadoEn: AHORA,
};

describe('EntrenadoresService', () => {
    const userRepository = {
        findEntrenadoresActivos: vi.fn(),
        findEntrenadorActivoById: vi.fn(),
    };
    const bloqueRepository = { findDisponiblesDelEntrenadorEntre: vi.fn() };
    const configuracionService = { obtenerPrecioClasePuntual: vi.fn() };
    const service = new EntrenadoresService(
        userRepository as unknown as UserRepository,
        bloqueRepository as unknown as BloqueRepository,
        configuracionService as unknown as ConfiguracionService,
    );

    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('lista los entrenadores activos solo con id y nombre completo', async () => {
        userRepository.findEntrenadoresActivos.mockResolvedValue([entrenador]);

        await expect(service.listar()).resolves.toEqual([
            { id: 'e1', nombre: 'Carlos Martínez' },
        ]);
    });

    it('responde 404 si el entrenador no existe o está inactivo', async () => {
        userRepository.findEntrenadorActivoById.mockResolvedValue(null);

        await expect(service.listarBloquesDisponibles('x', AHORA)).rejects.toThrow(
            NotFoundException,
        );
        expect(bloqueRepository.findDisponiblesDelEntrenadorEntre).not.toHaveBeenCalled();
    });

    it('busca bloques entre ahora + 2 h y ahora + 14 días', async () => {
        userRepository.findEntrenadorActivoById.mockResolvedValue(entrenador);
        bloqueRepository.findDisponiblesDelEntrenadorEntre.mockResolvedValue([]);
        configuracionService.obtenerPrecioClasePuntual.mockResolvedValue('10.00');

        await service.listarBloquesDisponibles('e1', AHORA);

        expect(bloqueRepository.findDisponiblesDelEntrenadorEntre).toHaveBeenCalledWith(
            'e1',
            new Date('2026-11-16T17:00:00Z'),
            new Date('2026-11-30T15:00:00Z'),
        );
    });

    it('devuelve los bloques sin estado ni entrenador, con el precio vigente', async () => {
        userRepository.findEntrenadorActivoById.mockResolvedValue(entrenador);
        bloqueRepository.findDisponiblesDelEntrenadorEntre.mockResolvedValue([bloque]);
        configuracionService.obtenerPrecioClasePuntual.mockResolvedValue('12.50');

        await expect(service.listarBloquesDisponibles('e1', AHORA)).resolves.toEqual({
            bloques: [
                { id: 'b1', inicio: bloque.inicio, fin: bloque.fin, duracionMin: 60 },
            ],
            precioClasePuntual: '12.50',
        });
    });
});