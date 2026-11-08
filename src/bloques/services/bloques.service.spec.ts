import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common';
import type { BloqueRepository } from '@Bloques/repositories';
import { HorarioOcupadoError } from '@Bloques/errors';
import { EstadoBloque, type BloqueDisponibilidad } from '@PrismaClient';
import { BloquesService } from './bloques.service.js';

const AHORA = new Date('2026-11-09T15:00:00Z'); // lunes 09:00 en El Salvador
const dto = { fecha: '2026-11-10', horaInicio: '07:00', duracionMin: 60 };

function bloque(datos: Partial<BloqueDisponibilidad>): BloqueDisponibilidad {
    return {
        id: 'b1',
        entrenadorId: 'e1',
        inicio: new Date('2026-11-10T13:00:00Z'),
        fin: new Date('2026-11-10T14:00:00Z'),
        duracionMin: 60,
        estado: EstadoBloque.DISPONIBLE,
        creadoEn: AHORA,
        ...datos,
    };
}

describe('BloquesService', () => {
    const repo = {
        findById: vi.fn(),
        findDelEntrenadorEntre: vi.fn(),
        crearSinTraslape: vi.fn(),
        eliminarSiDisponible: vi.fn(),
    };
    const service = new BloquesService(repo as unknown as BloqueRepository);

    beforeEach(() => {
        vi.resetAllMocks();
    });

    describe('crear', () => {
        it('guarda el bloque con el entrenador del token y fin = inicio + duración', async () => {
            repo.crearSinTraslape.mockImplementation((data) => Promise.resolve(bloque(data)));

            const creado = await service.crear('e1', dto, AHORA);

            // 07:00 en El Salvador = 13:00 UTC
            expect(repo.crearSinTraslape).toHaveBeenCalledWith({
                entrenadorId: 'e1',
                inicio: new Date('2026-11-10T13:00:00Z'),
                fin: new Date('2026-11-10T14:00:00Z'),
                duracionMin: 60,
            });
            expect(creado.estado).toBe(EstadoBloque.DISPONIBLE);
            expect(creado.miembro).toBeNull();
        });

        it('responde 400 con el motivo si la duración no es válida', async () => {
            await expect(service.crear('e1', { ...dto, duracionMin: 30 }, AHORA)).rejects.toThrow(
                BadRequestException,
            );
            expect(repo.crearSinTraslape).not.toHaveBeenCalled();
        });

        it('responde 409 si hay traslape con otro bloque o una clase', async () => {
            repo.crearSinTraslape.mockRejectedValue(new HorarioOcupadoError());

            await expect(service.crear('e1', dto, AHORA)).rejects.toThrow(
                new ConflictException('Ya tienes una actividad en ese horario'),
            );
        });
    });

    describe('eliminar', () => {
        it('elimina un bloque propio y disponible', async () => {
            repo.findById.mockResolvedValue(bloque({}));
            repo.eliminarSiDisponible.mockResolvedValue(true);

            await expect(service.eliminar('e1', 'b1')).resolves.toBeUndefined();
        });

        it('responde 404 si el bloque no existe', async () => {
            repo.findById.mockResolvedValue(null);
            await expect(service.eliminar('e1', 'b1')).rejects.toThrow(NotFoundException);
        });

        it('responde 403 si el bloque es de otro entrenador', async () => {
            repo.findById.mockResolvedValue(bloque({ entrenadorId: 'e2' }));

            await expect(service.eliminar('e1', 'b1')).rejects.toThrow(ForbiddenException);
            expect(repo.eliminarSiDisponible).not.toHaveBeenCalled();
        });

        it('responde 409 si el bloque está ocupado', async () => {
            repo.findById.mockResolvedValue(bloque({ estado: EstadoBloque.OCUPADO }));

            await expect(service.eliminar('e1', 'b1')).rejects.toThrow(
                new ConflictException('No puedes eliminar un bloque con una sesión agendada'),
            );
            expect(repo.eliminarSiDisponible).not.toHaveBeenCalled();
        });
    });
});