import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { BloqueRepository } from '@Bloques/repositories';
import { HorarioOcupadoError } from '@Bloques/errors';
import { BloqueResponseDto, type CreateBloqueDto } from '@Bloques/dto';
import { aFechaLocal, hoyLocal, rangoDeSemana } from '@Common/fechas';
import { assertOwnership } from '@Common/ownership';
import { EstadoBloque } from '@PrismaClient';
import { validarNuevoBloque } from './reglas-bloque.js';

const MS_POR_MINUTO = 60_000;

@Injectable()
export class BloquesService {
    constructor(private readonly bloqueRepository: BloqueRepository) { }

    async listarSemana(
        entrenadorId: string,
        semana?: string,
    ): Promise<BloqueResponseDto[]> {
        const { desde, hasta } = rangoDeSemana(semana ?? hoyLocal());
        const bloques = await this.bloqueRepository.findDelEntrenadorEntre(
            entrenadorId,
            desde,
            hasta,
        );
        return bloques.map((bloque) => BloqueResponseDto.fromEntity(bloque));
    }

    async crear(
        entrenadorId: string,
        dto: CreateBloqueDto,
        ahora: Date = new Date(),
    ): Promise<BloqueResponseDto> {
        const motivo = validarNuevoBloque(dto, ahora);
        if (motivo) {
            throw new BadRequestException(motivo);
        }

        const inicio = aFechaLocal(dto.fecha, dto.horaInicio);
        const fin = new Date(inicio.getTime() + dto.duracionMin * MS_POR_MINUTO);

        try {
            const bloque = await this.bloqueRepository.crearSinTraslape({
                entrenadorId,
                inicio,
                fin,
                duracionMin: dto.duracionMin,
            });
            return BloqueResponseDto.fromEntity(bloque);
        } catch (error) {
            if (error instanceof HorarioOcupadoError) {
                throw new ConflictException('Ya tienes una actividad en ese horario');
            }
            throw error;
        }
    }

    async eliminar(entrenadorId: string, id: string): Promise<void> {
        const bloque = await this.bloqueRepository.findById(id);
        if (!bloque) {
            throw new NotFoundException('El bloque no existe.');
        }

        assertOwnership(
            bloque.entrenadorId,
            entrenadorId,
            'No puedes eliminar un bloque de otro entrenador.',
        );

        const eliminado =
            bloque.estado === EstadoBloque.DISPONIBLE &&
            (await this.bloqueRepository.eliminarSiDisponible(id));

        if (!eliminado) {
            throw new ConflictException(
                'No puedes eliminar un bloque con una sesión agendada',
            );
        }
    }
}