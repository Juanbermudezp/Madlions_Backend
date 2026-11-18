import { Injectable, NotFoundException } from '@nestjs/common';
import { UserRepository } from '@Users/repositories';
import { BloqueRepository } from '@Bloques/repositories';
import { ConfiguracionService } from '@Configuracion/services';
import {
    BloqueLibreDto,
    EntrenadorResumenDto,
    type BloquesEntrenadorResponseDto,
} from '@Entrenadores/dto';

/** Un bloque solo se puede agendar si empieza dentro de 2 horas o más (H9). */
export const ANTICIPACION_MINIMA_HORAS = 2;

/** El miembro ve los bloques de los próximos 14 días (H9). */
export const DIAS_VISIBLES = 14;

const MS_POR_HORA = 60 * 60 * 1000;
const MS_POR_DIA = 24 * MS_POR_HORA;

/** Consulta de entrenadores y sus bloques libres para el miembro (H9, BE-9.1). */
@Injectable()
export class EntrenadoresService {
    constructor(
        private readonly userRepository: UserRepository,
        private readonly bloqueRepository: BloqueRepository,
        private readonly configuracionService: ConfiguracionService,
    ) { }

    async listar(): Promise<EntrenadorResumenDto[]> {
        const entrenadores = await this.userRepository.findEntrenadoresActivos();
        return entrenadores.map((e) => EntrenadorResumenDto.fromEntity(e));
    }

    /**
     * Bloques DISPONIBLES del entrenador que empiezan entre ahora + 2 h y
     * ahora + 14 días, con el precio vigente de la clase puntual.
     * `ahora` es un parámetro solo para poder probarlo.
     *
     * @throws {NotFoundException} 404 si el entrenador no existe o está inactivo.
     */
    async listarBloquesDisponibles(
        entrenadorId: string,
        ahora: Date = new Date(),
    ): Promise<BloquesEntrenadorResponseDto> {
        const entrenador = await this.userRepository.findEntrenadorActivoById(entrenadorId);
        if (!entrenador) {
            throw new NotFoundException('El entrenador no existe.');
        }

        const desde = new Date(ahora.getTime() + ANTICIPACION_MINIMA_HORAS * MS_POR_HORA);
        const hasta = new Date(ahora.getTime() + DIAS_VISIBLES * MS_POR_DIA);

        const [bloques, precioClasePuntual] = await Promise.all([
            this.bloqueRepository.findDisponiblesDelEntrenadorEntre(entrenadorId, desde, hasta),
            this.configuracionService.obtenerPrecioClasePuntual(),
        ]);

        return {
            bloques: bloques.map((b) => BloqueLibreDto.fromEntity(b)),
            precioClasePuntual,
        };
    }
}