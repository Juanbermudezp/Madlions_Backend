import {
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { TipoClaseRepository } from '@Clases/repositories';
import { TipoClaseDuplicadoError } from '@Clases/errors';
import {
    TipoClaseResponseDto,
    type CreateTipoClaseDto,
    type UpdateTipoClaseDto,
} from '@Clases/dto';

export const TIPO_CLASE_DUPLICADO = 'Ya existe un tipo de clase con ese nombre';
export const TIPO_CLASE_NO_EXISTE = 'El tipo de clase no existe.';

/** Catálogo de tipos de clase (H4, BE-4.1). */
@Injectable()
export class TiposClaseService {
    constructor(private readonly tipoClaseRepository: TipoClaseRepository) { }

    async listar(): Promise<TipoClaseResponseDto[]> {
        const tipos = await this.tipoClaseRepository.findActivos();
        return tipos.map((tipo) => TipoClaseResponseDto.fromEntity(tipo));
    }

    async crear(dto: CreateTipoClaseDto): Promise<TipoClaseResponseDto> {
        await this.asegurarNombreLibre(dto.nombre);

        try {
            const tipo = await this.tipoClaseRepository.create({
                nombre: dto.nombre,
                descripcion: dto.descripcion,
            });
            return TipoClaseResponseDto.fromEntity(tipo);
        } catch (error) {
            throw this.traducirError(error);
        }
    }

    async actualizar(id: string, dto: UpdateTipoClaseDto): Promise<TipoClaseResponseDto> {
        const actual = await this.tipoClaseRepository.findById(id);
        if (!actual) {
            throw new NotFoundException(TIPO_CLASE_NO_EXISTE);
        }

        if (dto.nombre !== undefined) {
            await this.asegurarNombreLibre(dto.nombre, id);
        }

        try {
            const tipo = await this.tipoClaseRepository.update(id, {
                ...(dto.nombre !== undefined ? { nombre: dto.nombre } : {}),
                ...(dto.descripcion !== undefined ? { descripcion: dto.descripcion } : {}),
            });
            return TipoClaseResponseDto.fromEntity(tipo);
        } catch (error) {
            throw this.traducirError(error);
        }
    }

    /**
     * Revisa el nombre sin distinguir mayúsculas. El índice único de la base
     * sigue siendo la última defensa si dos peticiones llegan a la vez.
     */
    private async asegurarNombreLibre(nombre: string, excluirId?: string): Promise<void> {
        const existente = await this.tipoClaseRepository.findPorNombre(nombre, excluirId);
        if (existente) {
            throw new ConflictException(TIPO_CLASE_DUPLICADO);
        }
    }

    private traducirError(error: unknown): unknown {
        if (error instanceof TipoClaseDuplicadoError) {
            return new ConflictException(TIPO_CLASE_DUPLICADO);
        }
        return error;
    }
}
