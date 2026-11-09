import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { TipoClaseRepository } from '@Clases/repositories';
import { PlanRepository, type CambiosPlan } from '@Planes/repositories';
import { PlanDuplicadoError } from '@Planes/errors';
import {
    PlanResponseDto,
    type CreatePlanDto,
    type UpdatePlanDto,
} from '@Planes/dto';
import { Rol } from '@PrismaClient';
import { duracionDiasPorTipo, errorCantidadClases } from './reglas-plan.js';

export const PLAN_DUPLICADO = 'Ya existe un plan con ese nombre';
export const PLAN_NO_EXISTE = 'El plan no existe.';
export const PLAN_YA_INACTIVO = 'El plan ya está inactivo.';
export const TIPO_CLASE_INEXISTENTE = 'Uno o más tipos de clase no existen.';

/**
 * Administración de planes (H1).
 *
 * Editar o desactivar un plan solo toca `plan` y `plan_tipo_clase`: las
 * membresías ya vendidas (H2) conservan la copia de sus condiciones y no se
 * modifican, igual que los cobros.
 */
@Injectable()
export class PlanesService {
    constructor(
        private readonly planRepository: PlanRepository,
        private readonly tipoClaseRepository: TipoClaseRepository,
    ) { }

    /** El administrador ve todos los planes; los demás roles, solo los activos. */
    async listar(rol: Rol): Promise<PlanResponseDto[]> {
        const planes = await this.planRepository.findTodos(rol !== Rol.ADMINISTRADOR);
        return planes.map((plan) => PlanResponseDto.fromEntity(plan));
    }

    async crear(dto: CreatePlanDto): Promise<PlanResponseDto> {
        this.validarCantidadClases(errorCantidadClases(dto.tipo, dto.cantidadClases, true));
        await this.asegurarTiposClaseExisten(dto.tiposClaseIds);
        await this.asegurarNombreLibre(dto.nombre);

        try {
            const plan = await this.planRepository.create(
                {
                    nombre: dto.nombre,
                    tipo: dto.tipo,
                    precio: dto.precio,
                    cantidadClases: dto.cantidadClases ?? null,
                    duracionDias: duracionDiasPorTipo(dto.tipo),
                    beneficios: dto.beneficios,
                },
                dto.tiposClaseIds,
            );
            return PlanResponseDto.fromEntity(plan);
        } catch (error) {
            throw this.traducirError(error);
        }
    }

    /** Edita los campos enviados. `dto.tipo` se ignora: el tipo no cambia. */
    async actualizar(id: string, dto: UpdatePlanDto): Promise<PlanResponseDto> {
        const actual = await this.planRepository.findById(id);
        if (!actual) {
            throw new NotFoundException(PLAN_NO_EXISTE);
        }

        this.validarCantidadClases(errorCantidadClases(actual.tipo, dto.cantidadClases, false));
        if (dto.tiposClaseIds !== undefined) {
            await this.asegurarTiposClaseExisten(dto.tiposClaseIds);
        }
        if (dto.nombre !== undefined) {
            await this.asegurarNombreLibre(dto.nombre, id);
        }

        const cambios: CambiosPlan = {
            ...(dto.nombre !== undefined ? { nombre: dto.nombre } : {}),
            ...(dto.precio !== undefined ? { precio: dto.precio } : {}),
            ...(dto.cantidadClases !== undefined ? { cantidadClases: dto.cantidadClases } : {}),
            ...(dto.beneficios !== undefined ? { beneficios: dto.beneficios } : {}),
        };

        try {
            const plan = await this.planRepository.update(id, cambios, dto.tiposClaseIds);
            return PlanResponseDto.fromEntity(plan);
        } catch (error) {
            throw this.traducirError(error);
        }
    }

    async desactivar(id: string): Promise<PlanResponseDto> {
        const actual = await this.planRepository.findById(id);
        if (!actual) {
            throw new NotFoundException(PLAN_NO_EXISTE);
        }

        const desactivado = await this.planRepository.desactivar(id);
        if (!desactivado) {
            throw new ConflictException(PLAN_YA_INACTIVO);
        }

        return PlanResponseDto.fromEntity({ ...actual, activo: false });
    }

    private validarCantidadClases(error: string | null): void {
        if (error) {
            throw new BadRequestException(error);
        }
    }

    private async asegurarTiposClaseExisten(ids: string[]): Promise<void> {
        const tipos = await Promise.all(ids.map((id) => this.tipoClaseRepository.findById(id)));
        if (tipos.some((tipo) => tipo === null)) {
            throw new BadRequestException(TIPO_CLASE_INEXISTENTE);
        }
    }

    /**
     * Revisa el nombre sin distinguir mayúsculas. El índice único de la base
     * sigue siendo la última defensa si dos peticiones llegan a la vez.
     */
    private async asegurarNombreLibre(nombre: string, excluirId?: string): Promise<void> {
        const existente = await this.planRepository.findPorNombre(nombre, excluirId);
        if (existente) {
            throw new ConflictException(PLAN_DUPLICADO);
        }
    }

    private traducirError(error: unknown): unknown {
        if (error instanceof PlanDuplicadoError) {
            return new ConflictException(PLAN_DUPLICADO);
        }
        return error;
    }
}
