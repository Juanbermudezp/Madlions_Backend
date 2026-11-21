import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { TipoClaseRepository } from '@Clases/repositories';
import type { PlanConTiposClase, PlanRepository } from '@Planes/repositories';
import { PlanDuplicadoError } from '@Planes/errors';
import { Prisma, Rol, TipoPlan, type TipoClase } from '@PrismaClient';
import {
    PLAN_DUPLICADO,
    PLAN_NO_EXISTE,
    PLAN_YA_INACTIVO,
    PlanesService,
    TIPO_CLASE_INEXISTENTE,
} from './planes.service.js';
import { CANTIDAD_CLASES_NO_PERMITIDA, CANTIDAD_CLASES_REQUERIDA } from './reglas-plan.js';

function plan(datos: Partial<PlanConTiposClase> = {}): PlanConTiposClase {
    return {
        id: 'p1',
        nombre: 'Mensual ilimitado',
        tipo: TipoPlan.MENSUAL,
        precio: new Prisma.Decimal('35.50'),
        cantidadClases: null,
        duracionDias: 30,
        beneficios: 'Sala de máquinas.',
        activo: true,
        creadoEn: new Date('2026-11-08T12:00:00Z'),
        actualizadoEn: new Date('2026-11-08T12:00:00Z'),
        tiposClase: [{ tipoClase: { id: 't1', nombre: 'Yoga' } }],
        ...datos,
    };
}

function tipoClase(id: string): TipoClase {
    return {
        id,
        nombre: `Tipo ${id}`,
        descripcion: 'Descripción',
        activo: true,
        creadoEn: new Date('2026-11-08T12:00:00Z'),
    };
}

describe('PlanesService', () => {
    const repo = {
        findTodos: vi.fn(),
        findById: vi.fn(),
        findPorNombre: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        desactivar: vi.fn(),
    };
    const tiposRepo = { findById: vi.fn() };
    const service = new PlanesService(
        repo as unknown as PlanRepository,
        tiposRepo as unknown as TipoClaseRepository,
    );

    beforeEach(() => {
        vi.resetAllMocks();
        tiposRepo.findById.mockImplementation((id: string) => Promise.resolve(tipoClase(id)));
        repo.findPorNombre.mockResolvedValue(null);
    });

    describe('listar', () => {
        it('el administrador recibe todos los planes, incluidos los inactivos', async () => {
            repo.findTodos.mockResolvedValue([plan(), plan({ id: 'p2', activo: false })]);

            const lista = await service.listar(Rol.ADMINISTRADOR);

            expect(repo.findTodos).toHaveBeenCalledWith(false);
            expect(lista).toHaveLength(2);
        });

        it.each([Rol.MIEMBRO, Rol.ENTRENADOR, Rol.RECEPCION])('%s solo recibe los activos', async (rol) => {
            repo.findTodos.mockResolvedValue([plan()]);

            await service.listar(rol);

            expect(repo.findTodos).toHaveBeenCalledWith(true);
        });

        it('devuelve la forma del contrato, con precio numérico y tipos de clase ordenados', async () => {
            repo.findTodos.mockResolvedValue([
                plan({
                    tiposClase: [
                        { tipoClase: { id: 't2', nombre: 'Spinning' } },
                        { tipoClase: { id: 't1', nombre: 'Crossfit' } },
                    ],
                }),
            ]);

            const [respuesta] = await service.listar(Rol.ADMINISTRADOR);

            expect(respuesta).toEqual({
                id: 'p1',
                nombre: 'Mensual ilimitado',
                tipo: TipoPlan.MENSUAL,
                precio: 35.5,
                cantidadClases: null,
                duracionDias: 30,
                beneficios: 'Sala de máquinas.',
                activo: true,
                tiposClase: [
                    { id: 't1', nombre: 'Crossfit' },
                    { id: 't2', nombre: 'Spinning' },
                ],
            });
        });
    });

    describe('crear', () => {
        const dto = {
            nombre: 'Mensual ilimitado',
            tipo: TipoPlan.MENSUAL,
            precio: 35.5,
            beneficios: 'Sala de máquinas.',
            tiposClaseIds: ['t1'],
        };

        it('guarda un plan MENSUAL con 30 días y sin cantidad de clases', async () => {
            repo.create.mockResolvedValue(plan());

            const creado = await service.crear(dto);

            expect(repo.create).toHaveBeenCalledWith(
                {
                    nombre: 'Mensual ilimitado',
                    tipo: TipoPlan.MENSUAL,
                    precio: 35.5,
                    cantidadClases: null,
                    duracionDias: 30,
                    beneficios: 'Sala de máquinas.',
                },
                ['t1'],
            );
            expect(creado.id).toBe('p1');
        });

        it('guarda un DAYPASS con 1 día', async () => {
            repo.create.mockResolvedValue(plan({ tipo: TipoPlan.DAYPASS, duracionDias: 1 }));

            await service.crear({ ...dto, tipo: TipoPlan.DAYPASS });

            expect(repo.create.mock.calls[0][0]).toMatchObject({ duracionDias: 1, cantidadClases: null });
        });

        it('guarda un SET_CLASES con su cantidad de clases y 30 días', async () => {
            repo.create.mockResolvedValue(plan({ tipo: TipoPlan.SET_CLASES, cantidadClases: 10 }));

            await service.crear({ ...dto, tipo: TipoPlan.SET_CLASES, cantidadClases: 10 });

            expect(repo.create.mock.calls[0][0]).toMatchObject({ duracionDias: 30, cantidadClases: 10 });
        });

        it('responde 400 si un SET_CLASES no trae cantidad de clases', async () => {
            await expect(service.crear({ ...dto, tipo: TipoPlan.SET_CLASES })).rejects.toThrow(
                new BadRequestException(CANTIDAD_CLASES_REQUERIDA),
            );
            expect(repo.create).not.toHaveBeenCalled();
        });

        it.each([TipoPlan.DAYPASS, TipoPlan.MENSUAL])('responde 400 si un %s trae cantidad de clases', async (tipo) => {
            await expect(service.crear({ ...dto, tipo, cantidadClases: 5 })).rejects.toThrow(
                new BadRequestException(CANTIDAD_CLASES_NO_PERMITIDA),
            );
            expect(repo.create).not.toHaveBeenCalled();
        });

        it('responde 400 si algún tipo de clase no existe', async () => {
            tiposRepo.findById.mockImplementation((id: string) =>
                Promise.resolve(id === 'no-existe' ? null : tipoClase(id)),
            );

            await expect(service.crear({ ...dto, tiposClaseIds: ['t1', 'no-existe'] })).rejects.toThrow(
                new BadRequestException(TIPO_CLASE_INEXISTENTE),
            );
            expect(repo.create).not.toHaveBeenCalled();
        });

        it('responde 409 si ya existe un plan con ese nombre (sin importar mayúsculas)', async () => {
            repo.findPorNombre.mockResolvedValue(plan({ nombre: 'mensual ilimitado' }));

            await expect(service.crear(dto)).rejects.toThrow(new ConflictException(PLAN_DUPLICADO));
            expect(repo.findPorNombre).toHaveBeenCalledWith('Mensual ilimitado', undefined);
            expect(repo.create).not.toHaveBeenCalled();
        });

        it('responde 409 si la base rechaza el nombre por una petición simultánea', async () => {
            repo.create.mockRejectedValue(new PlanDuplicadoError('Mensual ilimitado'));

            await expect(service.crear(dto)).rejects.toThrow(new ConflictException(PLAN_DUPLICADO));
        });

        it('deja pasar los errores que no son de nombre duplicado', async () => {
            repo.create.mockRejectedValue(new Error('conexión perdida'));

            await expect(service.crear(dto)).rejects.toThrow('conexión perdida');
        });
    });

    describe('actualizar', () => {
        it('responde 404 si el plan no existe', async () => {
            repo.findById.mockResolvedValue(null);

            await expect(service.actualizar('p1', { precio: 40 })).rejects.toThrow(
                new NotFoundException(PLAN_NO_EXISTE),
            );
            expect(repo.update).not.toHaveBeenCalled();
        });

        it('envía solo los campos que llegaron', async () => {
            repo.findById.mockResolvedValue(plan());
            repo.update.mockResolvedValue(plan({ precio: new Prisma.Decimal('40.00') }));

            const editado = await service.actualizar('p1', { precio: 40 });

            expect(repo.update).toHaveBeenCalledWith('p1', { precio: 40 }, undefined);
            expect(repo.findPorNombre).not.toHaveBeenCalled();
            expect(tiposRepo.findById).not.toHaveBeenCalled();
            expect(editado.precio).toBe(40);
        });

        it('ignora el campo tipo', async () => {
            repo.findById.mockResolvedValue(plan());
            repo.update.mockResolvedValue(plan());

            await service.actualizar('p1', { tipo: TipoPlan.DAYPASS, beneficios: 'Nuevos' });

            expect(repo.update).toHaveBeenCalledWith('p1', { beneficios: 'Nuevos' }, undefined);
        });

        it('revisa el nombre nuevo excluyendo al propio plan', async () => {
            repo.findById.mockResolvedValue(plan());
            repo.update.mockResolvedValue(plan({ nombre: 'MENSUAL ILIMITADO' }));

            await service.actualizar('p1', { nombre: 'MENSUAL ILIMITADO' });

            expect(repo.findPorNombre).toHaveBeenCalledWith('MENSUAL ILIMITADO', 'p1');
        });

        it('responde 409 si el nombre nuevo pertenece a otro plan', async () => {
            repo.findById.mockResolvedValue(plan());
            repo.findPorNombre.mockResolvedValue(plan({ id: 'p2', nombre: 'Daypass' }));

            await expect(service.actualizar('p1', { nombre: 'daypass' })).rejects.toThrow(
                new ConflictException(PLAN_DUPLICADO),
            );
            expect(repo.update).not.toHaveBeenCalled();
        });

        it('responde 409 si la base rechaza el nombre por una petición simultánea', async () => {
            repo.findById.mockResolvedValue(plan());
            repo.update.mockRejectedValue(new PlanDuplicadoError('Daypass'));

            await expect(service.actualizar('p1', { nombre: 'Daypass' })).rejects.toThrow(
                new ConflictException(PLAN_DUPLICADO),
            );
        });

        it('reemplaza los tipos de clase cuando llegan', async () => {
            repo.findById.mockResolvedValue(plan());
            repo.update.mockResolvedValue(plan());

            await service.actualizar('p1', { tiposClaseIds: ['t2', 't3'] });

            expect(tiposRepo.findById).toHaveBeenCalledTimes(2);
            expect(repo.update).toHaveBeenCalledWith('p1', {}, ['t2', 't3']);
        });

        it('responde 400 si algún tipo de clase nuevo no existe', async () => {
            repo.findById.mockResolvedValue(plan());
            tiposRepo.findById.mockResolvedValue(null);

            await expect(service.actualizar('p1', { tiposClaseIds: ['x'] })).rejects.toThrow(
                new BadRequestException(TIPO_CLASE_INEXISTENTE),
            );
            expect(repo.update).not.toHaveBeenCalled();
        });

        it('permite cambiar la cantidad de clases de un SET_CLASES', async () => {
            repo.findById.mockResolvedValue(plan({ tipo: TipoPlan.SET_CLASES, cantidadClases: 10 }));
            repo.update.mockResolvedValue(plan({ tipo: TipoPlan.SET_CLASES, cantidadClases: 20 }));

            await service.actualizar('p1', { cantidadClases: 20 });

            expect(repo.update).toHaveBeenCalledWith('p1', { cantidadClases: 20 }, undefined);
        });

        it('responde 400 si se intenta dejar sin cantidad de clases un SET_CLASES', async () => {
            repo.findById.mockResolvedValue(plan({ tipo: TipoPlan.SET_CLASES, cantidadClases: 10 }));

            await expect(service.actualizar('p1', { cantidadClases: null })).rejects.toThrow(
                new BadRequestException(CANTIDAD_CLASES_REQUERIDA),
            );
            expect(repo.update).not.toHaveBeenCalled();
        });

        it('responde 400 si se envía cantidad de clases a un plan que no es SET_CLASES', async () => {
            repo.findById.mockResolvedValue(plan({ tipo: TipoPlan.MENSUAL }));

            await expect(service.actualizar('p1', { cantidadClases: 5 })).rejects.toThrow(
                new BadRequestException(CANTIDAD_CLASES_NO_PERMITIDA),
            );
            expect(repo.update).not.toHaveBeenCalled();
        });

        it('valida la cantidad de clases contra el tipo guardado, no contra el tipo enviado', async () => {
            repo.findById.mockResolvedValue(plan({ tipo: TipoPlan.MENSUAL }));

            await expect(
                service.actualizar('p1', { tipo: TipoPlan.SET_CLASES, cantidadClases: 5 }),
            ).rejects.toThrow(new BadRequestException(CANTIDAD_CLASES_NO_PERMITIDA));
        });
    });

    describe('desactivar', () => {
        it('desactiva un plan activo y lo devuelve inactivo', async () => {
            repo.findById.mockResolvedValue(plan());
            repo.desactivar.mockResolvedValue(true);

            const respuesta = await service.desactivar('p1');

            expect(repo.desactivar).toHaveBeenCalledWith('p1');
            expect(respuesta.activo).toBe(false);
        });

        it('responde 404 si el plan no existe', async () => {
            repo.findById.mockResolvedValue(null);

            await expect(service.desactivar('p1')).rejects.toThrow(new NotFoundException(PLAN_NO_EXISTE));
            expect(repo.desactivar).not.toHaveBeenCalled();
        });

        it('responde 409 si el plan ya está inactivo', async () => {
            repo.findById.mockResolvedValue(plan({ activo: false }));
            repo.desactivar.mockResolvedValue(false);

            await expect(service.desactivar('p1')).rejects.toThrow(new ConflictException(PLAN_YA_INACTIVO));
        });
    });
});
