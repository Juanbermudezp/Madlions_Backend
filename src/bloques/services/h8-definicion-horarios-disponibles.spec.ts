import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import type { BloqueRepository } from '@Bloques/repositories';
import { HorarioOcupadoError } from '@Bloques/errors';
import { BloquesController } from '@Bloques/controllers';
import { EstadoBloque, Rol, type BloqueDisponibilidad } from '@PrismaClient';
import { rolesPermitidos } from '../../../test/helpers/roles.js';
import { BloquesService } from './bloques.service.js';
import { validarNuevoBloque } from './reglas-bloque.js';

const AHORA = new Date('2026-11-09T15:00:00Z'); // lunes 09:00 en El Salvador
const dto = { fecha: '2026-11-10', horaInicio: '07:00', duracionMin: 60 };

function bloque(datos: Partial<BloqueDisponibilidad> = {}): BloqueDisponibilidad {
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

describe('H8. Definición de horarios disponibles', () => {
    const repo = { findById: vi.fn(), findDelEntrenadorEntre: vi.fn(), crearSinTraslape: vi.fn(), eliminarSiDisponible: vi.fn() };
    const service = new BloquesService(repo as unknown as BloqueRepository);

    beforeEach(() => vi.resetAllMocks());

    it('AC1: un bloque dentro de 28 días, entre 5:00 y 21:00 en múltiplos de 15 y de 45, 60 o 90 minutos queda "Disponible"', async () => {
        for (const duracionMin of [45, 60, 90]) {
            expect(validarNuevoBloque({ ...dto, duracionMin }, AHORA)).toBeNull();
        }
        expect(validarNuevoBloque({ fecha: '2026-12-07', horaInicio: '21:00', duracionMin: 60 }, AHORA)).toBeNull();

        repo.crearSinTraslape.mockResolvedValue(bloque());
        await expect(service.crear('e1', dto, AHORA)).resolves.toMatchObject({ id: 'b1', estado: EstadoBloque.DISPONIBLE });
        expect(repo.crearSinTraslape).toHaveBeenCalledWith({
            entrenadorId: 'e1',
            inicio: new Date('2026-11-10T13:00:00Z'),
            fin: new Date('2026-11-10T14:00:00Z'),
            duracionMin: 60,
        });
    });

    it('AC2: al guardar, el servidor devuelve el bloque creado para mostrarlo sin recargar', async () => {
        repo.crearSinTraslape.mockResolvedValue(bloque({ id: 'nuevo' }));

        const creado = await service.crear('e1', dto, AHORA);

        expect(creado).toMatchObject({ id: 'nuevo', estado: EstadoBloque.DISPONIBLE, duracionMin: 60 });
    });

    it('AC3: el calendario semanal trae los bloques disponibles y los ocupados con el nombre del miembro', async () => {
        repo.findDelEntrenadorEntre.mockResolvedValue([
            { ...bloque({ id: 'b1' }), sesion: null },
            { ...bloque({ id: 'b2', estado: EstadoBloque.OCUPADO }), sesion: { miembro: { usuario: { nombre: 'María', apellido: 'López' } } } },
        ]);

        const bloques = await service.listarSemana('e1', '2026-11-10');

        expect(bloques.map((b) => [b.id, b.estado, b.miembro])).toEqual([
            ['b1', EstadoBloque.DISPONIBLE, null],
            ['b2', EstadoBloque.OCUPADO, { nombre: 'María López' }],
        ]);
    });

    it('AC4: un bloque disponible propio se elimina', async () => {
        repo.findById.mockResolvedValue(bloque());
        repo.eliminarSiDisponible.mockResolvedValue(true);

        await expect(service.eliminar('e1', 'b1')).resolves.toBeUndefined();
        expect(repo.eliminarSiDisponible).toHaveBeenCalledWith('b1');
    });

    it('AC5: un bloque ocupado no se puede eliminar', async () => {
        repo.findById.mockResolvedValue(bloque({ estado: EstadoBloque.OCUPADO }));

        await expect(service.eliminar('e1', 'b1')).rejects.toThrow(
            new ConflictException('No puedes eliminar un bloque con una sesión agendada'),
        );
        expect(repo.eliminarSiDisponible).not.toHaveBeenCalled();
    });

    it('AC6: un bloque que se traslapa con otro bloque o con una clase programada no se guarda', async () => {
        repo.crearSinTraslape.mockRejectedValue(new HorarioOcupadoError());

        await expect(service.crear('e1', dto, AHORA)).rejects.toThrow(new ConflictException('Ya tienes una actividad en ese horario'));
    });

    it('AC7: rechaza duración distinta de 45/60/90, fecha pasada o a más de 28 días y hora fuera del horario', async () => {
        expect(validarNuevoBloque({ ...dto, duracionMin: 30 }, AHORA)).toBe('La duración debe ser de 45, 60 o 90 minutos.');
        expect(validarNuevoBloque({ ...dto, fecha: '2026-11-08' }, AHORA)).toBe('La fecha ya pasó.');
        expect(validarNuevoBloque({ ...dto, fecha: '2026-12-08' }, AHORA)).toBe('La fecha debe estar dentro de los próximos 28 días.');
        for (const horaInicio of ['04:45', '21:15', '07:10']) {
            expect(validarNuevoBloque({ ...dto, horaInicio }, AHORA)).toBe(
                'La hora de inicio debe estar entre 5:00 y 21:00, en múltiplos de 15 minutos.',
            );
        }
        await expect(service.crear('e1', { ...dto, duracionMin: 30 }, AHORA)).rejects.toBeInstanceOf(BadRequestException);
        expect(repo.crearSinTraslape).not.toHaveBeenCalled();
    });

    it('AC8: no se puede eliminar el bloque de otro entrenador y solo el entrenador crea o elimina bloques', async () => {
        repo.findById.mockResolvedValue(bloque({ entrenadorId: 'otro' }));
        await expect(service.eliminar('e1', 'b1')).rejects.toBeInstanceOf(ForbiddenException);
        expect(repo.eliminarSiDisponible).not.toHaveBeenCalled();

        expect(rolesPermitidos(BloquesController, 'crear')).toEqual([Rol.ENTRENADOR]);
        expect(rolesPermitidos(BloquesController, 'eliminar')).toEqual([Rol.ENTRENADOR]);
    });
});
