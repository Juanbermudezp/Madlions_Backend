import { ConflictException, NotFoundException } from '@nestjs/common';
import type { TipoClaseRepository } from '@Clases/repositories';
import { TipoClaseDuplicadoError } from '@Clases/errors';
import type { TipoClase } from '@PrismaClient';
import {
    TIPO_CLASE_DUPLICADO,
    TIPO_CLASE_NO_EXISTE,
    TiposClaseService,
} from './tipos-clase.service.js';

function tipo(datos: Partial<TipoClase> = {}): TipoClase {
    return {
        id: 't1',
        nombre: 'Yoga',
        descripcion: 'Posturas, respiración y flexibilidad.',
        activo: true,
        creadoEn: new Date('2026-11-08T12:00:00Z'),
        ...datos,
    };
}

describe('TiposClaseService', () => {
    const repo = {
        findActivos: vi.fn(),
        findById: vi.fn(),
        findPorNombre: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
    };
    const service = new TiposClaseService(repo as unknown as TipoClaseRepository);

    beforeEach(() => {
        vi.resetAllMocks();
    });

    describe('listar', () => {
        it('devuelve id, nombre y descripción de los tipos activos', async () => {
            repo.findActivos.mockResolvedValue([tipo(), tipo({ id: 't2', nombre: 'Spinning' })]);

            const lista = await service.listar();

            expect(lista).toEqual([
                { id: 't1', nombre: 'Yoga', descripcion: 'Posturas, respiración y flexibilidad.' },
                { id: 't2', nombre: 'Spinning', descripcion: 'Posturas, respiración y flexibilidad.' },
            ]);
        });
    });

    describe('crear', () => {
        const dto = { nombre: 'Pilates', descripcion: 'Control y fuerza del core.' };

        it('guarda el tipo cuando el nombre está libre', async () => {
            repo.findPorNombre.mockResolvedValue(null);
            repo.create.mockImplementation((data) => Promise.resolve(tipo({ id: 't9', ...data })));

            const creado = await service.crear(dto);

            expect(repo.findPorNombre).toHaveBeenCalledWith('Pilates', undefined);
            expect(repo.create).toHaveBeenCalledWith(dto);
            expect(creado).toEqual({ id: 't9', ...dto });
        });

        it('responde 409 si ya existe un tipo con el mismo nombre (sin importar mayúsculas)', async () => {
            repo.findPorNombre.mockResolvedValue(tipo({ nombre: 'pilates' }));

            await expect(service.crear(dto)).rejects.toThrow(
                new ConflictException(TIPO_CLASE_DUPLICADO),
            );
            expect(repo.create).not.toHaveBeenCalled();
        });

        it('responde 409 si la base rechaza el nombre por una petición simultánea', async () => {
            repo.findPorNombre.mockResolvedValue(null);
            repo.create.mockRejectedValue(new TipoClaseDuplicadoError('Pilates'));

            await expect(service.crear(dto)).rejects.toThrow(ConflictException);
        });

        it('deja pasar los errores que no son de nombre duplicado', async () => {
            repo.findPorNombre.mockResolvedValue(null);
            repo.create.mockRejectedValue(new Error('conexión perdida'));

            await expect(service.crear(dto)).rejects.toThrow('conexión perdida');
        });
    });

    describe('actualizar', () => {
        it('responde 404 si el tipo no existe', async () => {
            repo.findById.mockResolvedValue(null);

            await expect(service.actualizar('t1', { nombre: 'Yoga suave' })).rejects.toThrow(
                new NotFoundException(TIPO_CLASE_NO_EXISTE),
            );
            expect(repo.update).not.toHaveBeenCalled();
        });

        it('revisa el nombre nuevo excluyendo al propio tipo', async () => {
            repo.findById.mockResolvedValue(tipo());
            repo.findPorNombre.mockResolvedValue(null);
            repo.update.mockResolvedValue(tipo({ nombre: 'YOGA' }));

            const editado = await service.actualizar('t1', { nombre: 'YOGA' });

            expect(repo.findPorNombre).toHaveBeenCalledWith('YOGA', 't1');
            expect(repo.update).toHaveBeenCalledWith('t1', { nombre: 'YOGA' });
            expect(editado.nombre).toBe('YOGA');
        });

        it('responde 409 si el nombre nuevo pertenece a otro tipo', async () => {
            repo.findById.mockResolvedValue(tipo());
            repo.findPorNombre.mockResolvedValue(tipo({ id: 't2', nombre: 'Spinning' }));

            await expect(service.actualizar('t1', { nombre: 'spinning' })).rejects.toThrow(
                new ConflictException(TIPO_CLASE_DUPLICADO),
            );
            expect(repo.update).not.toHaveBeenCalled();
        });

        it('si solo cambia la descripción no revisa el nombre y solo envía ese campo', async () => {
            repo.findById.mockResolvedValue(tipo());
            repo.update.mockResolvedValue(tipo({ descripcion: 'Nueva' }));

            await service.actualizar('t1', { descripcion: 'Nueva' });

            expect(repo.findPorNombre).not.toHaveBeenCalled();
            expect(repo.update).toHaveBeenCalledWith('t1', { descripcion: 'Nueva' });
        });
    });
});
