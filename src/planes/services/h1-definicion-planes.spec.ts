import { BadRequestException, ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { TipoClaseRepository } from '@Clases/repositories';
import type { PlanConTiposClase, PlanRepository } from '@Planes/repositories';
import { PlanesController } from '@Planes/controllers';
import { CANTIDAD_CLASES_INVALIDA, CreatePlanDto, PRECIO_PLAN_INVALIDO, UpdatePlanDto } from '@Planes/dto';
import type { ConfiguracionRepository } from '@Configuracion/repositories';
import { ConfiguracionController } from '@Configuracion/controllers';
import { ConfiguracionService } from '@Configuracion/services';
import { Prisma, Rol, TipoPlan, type TipoClase } from '@PrismaClient';
import { rolesPermitidos } from '../../../test/helpers/roles.js';
import { PlanesService } from './planes.service.js';
import { duracionDiasPorTipo } from './reglas-plan.js';

const opciones = { whitelist: true, forbidNonWhitelisted: true };
const T1 = '21d9fa0e-89ca-4516-a43c-6b6b8f773940';

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
        tiposClase: [{ tipoClase: { id: T1, nombre: 'Yoga' } }],
        ...datos,
    };
}

const tipoClase = (id: string): TipoClase => ({ id, nombre: 'Yoga', descripcion: 'x', activo: true, creadoEn: new Date() });

const dtoValido = {
    nombre: 'Mensual ilimitado',
    tipo: TipoPlan.MENSUAL,
    precio: 35.5,
    beneficios: 'Sala de máquinas.',
    tiposClaseIds: [T1],
};

async function mensajes(clase: typeof CreatePlanDto | typeof UpdatePlanDto, datos: object) {
    const errores = await validate(plainToInstance(clase, datos), opciones);
    return errores.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('H1. Definición y administración de planes', () => {
    const repo = { findTodos: vi.fn(), findById: vi.fn(), findPorNombre: vi.fn(), create: vi.fn(), update: vi.fn(), desactivar: vi.fn() };
    const tiposRepo = { findById: vi.fn() };
    const service = new PlanesService(repo as unknown as PlanRepository, tiposRepo as unknown as TipoClaseRepository);

    beforeEach(() => {
        vi.resetAllMocks();
        tiposRepo.findById.mockImplementation((id: string) => Promise.resolve(tipoClase(id)));
        repo.findPorNombre.mockResolvedValue(null);
    });

    it('AC1: registra un plan activo con tipo, precio, beneficios y tipos de clase, visible en el catálogo', async () => {
        repo.create.mockResolvedValue(plan());

        await expect(service.crear(dtoValido)).resolves.toMatchObject({ id: 'p1', activo: true, tipo: TipoPlan.MENSUAL });
        expect(repo.create).toHaveBeenCalledWith(
            expect.objectContaining({ nombre: 'Mensual ilimitado', tipo: TipoPlan.MENSUAL, precio: 35.5, beneficios: 'Sala de máquinas.' }),
            [T1],
        );

        repo.findTodos.mockResolvedValue([plan()]);
        await service.listar(Rol.RECEPCION);
        expect(repo.findTodos).toHaveBeenCalledWith(true); // recepción y miembros solo ven los activos
    });

    it('AC2: el Set de clases exige de 1 a 100 clases y cubre 30 días; Daypass cubre 1 día y Mensual 30', async () => {
        expect(duracionDiasPorTipo(TipoPlan.SET_CLASES)).toBe(30);
        expect(duracionDiasPorTipo(TipoPlan.DAYPASS)).toBe(1);
        expect(duracionDiasPorTipo(TipoPlan.MENSUAL)).toBe(30);

        await expect(service.crear({ ...dtoValido, tipo: TipoPlan.SET_CLASES })).rejects.toBeInstanceOf(BadRequestException);

        repo.create.mockResolvedValue(plan({ tipo: TipoPlan.SET_CLASES, cantidadClases: 8 }));
        await service.crear({ ...dtoValido, tipo: TipoPlan.SET_CLASES, cantidadClases: 8 });
        expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ cantidadClases: 8, duracionDias: 30 }), [T1]);
    });

    it('AC3: el precio de la clase puntual que define el administrador es el que se usa al agendar desde ese momento', async () => {
        const filas = new Map<string, string>([['precio_clase_puntual', '10.00']]);
        const configRepo = {
            findByClave: vi.fn((clave: string) => Promise.resolve(filas.has(clave) ? { clave, valor: filas.get(clave)! } : null)),
            guardar: vi.fn((clave: string, valor: string) => {
                filas.set(clave, valor);
                return Promise.resolve({ clave, valor });
            }),
        };
        const config = new ConfiguracionService(configRepo as unknown as ConfiguracionRepository);

        await expect(config.actualizarPrecioClasePuntual({ precio: 12.5 })).resolves.toEqual({ precio: '12.50' });
        await expect(config.obtenerPrecioClasePuntual()).resolves.toBe('12.50');
    });

    it('AC4: editar un plan no cambia su tipo y solo actualiza los campos enviados del plan', async () => {
        repo.findById.mockResolvedValue(plan());
        repo.update.mockResolvedValue(plan({ precio: new Prisma.Decimal('40.00') }));
        // `tipo` se acepta en el cuerpo pero se ignora: nunca llega al repositorio.
        const dto = plainToInstance(UpdatePlanDto, { tipo: TipoPlan.DAYPASS, precio: 40 });
        expect(await validate(dto, opciones)).toEqual([]);
        await service.actualizar('p1', dto);

        expect(repo.update).toHaveBeenCalledWith('p1', { precio: 40 }, undefined);
    });

    it('AC5: un plan activo se puede desactivar y ya no aparece para nuevas compras', async () => {
        repo.findById.mockResolvedValue(plan());
        repo.desactivar.mockResolvedValue(true);

        await expect(service.desactivar('p1')).resolves.toMatchObject({ id: 'p1', activo: false });

        repo.desactivar.mockResolvedValue(false);
        await expect(service.desactivar('p1')).rejects.toThrow(new ConflictException('El plan ya está inactivo.'));
    });

    it('AC6: rechaza campos vacíos, precio ≤ 0, cantidad fuera de 1 a 100 y nombre repetido', async () => {
        expect(await mensajes(CreatePlanDto, { ...dtoValido, precio: 0 })).toContain(PRECIO_PLAN_INVALIDO);
        expect(await mensajes(CreatePlanDto, { ...dtoValido, tipo: TipoPlan.SET_CLASES, cantidadClases: 101 })).toContain(
            CANTIDAD_CLASES_INVALIDA,
        );
        expect(await mensajes(CreatePlanDto, { ...dtoValido, nombre: '' })).not.toEqual([]);
        expect(await mensajes(CreatePlanDto, { ...dtoValido, beneficios: '' })).not.toEqual([]);

        repo.findPorNombre.mockResolvedValue(plan());
        await expect(service.crear(dtoValido)).rejects.toThrow(new ConflictException('Ya existe un plan con ese nombre'));
        expect(repo.create).not.toHaveBeenCalled();
    });

    it('AC7: solo el administrador crea, edita o desactiva planes y cambia el precio de la clase puntual', () => {
        for (const metodo of ['crear', 'actualizar', 'desactivar']) {
            expect(rolesPermitidos(PlanesController, metodo)).toEqual([Rol.ADMINISTRADOR]);
        }
        expect(rolesPermitidos(ConfiguracionController, 'actualizarPrecioClasePuntual')).toEqual([Rol.ADMINISTRADOR]);
    });
});
