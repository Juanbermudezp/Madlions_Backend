import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { AsistenciaRepository } from '@Asistencia/repositories';
import {
    ActividadPendienteDto,
    MARCAS_REPETIDAS,
    type MarcaGuardadaDto,
    type MarcarAsistenciaDto,
} from '@Asistencia/dto';
import { dentroDeLaVentana, FUERA_DE_VENTANA } from './reglas-asistencia.js';

export const REGISTRO_NO_EXISTE = 'El registro de asistencia no existe.';
export const ACTIVIDAD_DE_OTRO_ENTRENADOR =
    'La clase o sesión es de otro entrenador.';
export const RESERVA_CANCELADA =
    'La reserva está cancelada: no se registra asistencia.';

// Registro de asistencia a clases y sesiones (H19).

@Injectable()
export class AsistenciaService {
    constructor(private readonly asistenciaRepository: AsistenciaRepository) { }

    /** H19 · Clases y sesiones del entrenador dentro de la ventana de registro. */
    async pendientes(entrenadorId: string): Promise<ActividadPendienteDto[]> {
        const actividades = await this.asistenciaRepository.findActividades(
            entrenadorId,
            new Date(),
        );
        return actividades.map((actividad) => ActividadPendienteDto.fromEntity(actividad));
    }

    /**
     * H19 · Guarda las marcas de asistencia. La ventana y el entrenador se
     * revisan acá para cada marca, no solo al listar (criterio técnico): si
     * una sola falla, no se guarda ninguna.
     *
     * @throws {BadRequestException} si el mismo registro viene dos veces.
     * @throws {NotFoundException} si un registro no existe.
     * @throws {ForbiddenException} si la actividad es de otro entrenador.
     * @throws {ConflictException} si está fuera de la ventana o la reserva está cancelada.
     */
    async marcar(
        entrenadorId: string,
        datos: MarcarAsistenciaDto,
    ): Promise<MarcaGuardadaDto[]> {
        const claves = datos.marcas.map((marca) => `${marca.tipo}:${marca.registroId}`);
        if (new Set(claves).size !== claves.length) {
            throw new BadRequestException(MARCAS_REPETIDAS);
        }

        const ahora = new Date();

        for (const marca of datos.marcas) {
            const registro = await this.asistenciaRepository.findRegistro(
                marca.tipo,
                marca.registroId,
            );
            if (!registro) throw new NotFoundException(REGISTRO_NO_EXISTE);
            if (registro.entrenadorId !== entrenadorId) {
                throw new ForbiddenException(ACTIVIDAD_DE_OTRO_ENTRENADOR);
            }
            if (!registro.activo) throw new ConflictException(RESERVA_CANCELADA);
            if (!dentroDeLaVentana(registro.inicio, registro.fin, ahora)) {
                throw new ConflictException(FUERA_DE_VENTANA);
            }
        }

        await this.asistenciaRepository.marcar(datos.marcas, entrenadorId, ahora);

        return datos.marcas.map((marca) => ({
            tipo: marca.tipo,
            registroId: marca.registroId,
            asistencia: marca.asistencia,
            registradaEn: ahora.toISOString(),
        }));
    }
}
