import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { ResenaRepository } from '@Resenas/repositories';
import {
    PendienteResenaDto,
    ResenaResponseDto,
    type CrearResenaDto,
} from '@Resenas/dto';
import {
    CALIFICA_AL_MENOS_UN_ASPECTO,
    dentroDelPlazo,
    hayAlgunaCalificacion,
} from './reglas-resena.js';

export const SIN_FICHA_DE_MIEMBRO = 'El usuario no tiene ficha de miembro.';
export const REGISTRO_NO_EXISTE = 'La clase o sesión no existe.';
export const REGISTRO_DE_OTRO_MIEMBRO = 'La clase o sesión es de otro miembro.';
export const SIN_ASISTENCIA = 'Solo puedes calificar una clase o sesión a la que asististe.';
export const FUERA_DE_PLAZO = 'El plazo para calificar venció: son 7 días después de la clase o sesión.';
export const YA_CALIFICADA = 'Ya calificaste esta clase o sesión.';

// Reseñas de clases y sesiones (H20).

@Injectable()
export class ResenasService {
    constructor(private readonly resenaRepository: ResenaRepository) { }

    /** H20 · Clases y sesiones que el miembro todavía puede calificar. */
    async pendientes(usuarioId: string): Promise<PendienteResenaDto[]> {
        const miembroId = await this.miembroDe(usuarioId);
        const pendientes = await this.resenaRepository.findPendientes(miembroId, new Date());

        return pendientes.map((pendiente) => PendienteResenaDto.fromEntity(pendiente));
    }

    /**
     * H20 · Guarda la reseña. El entrenador y el tipo de clase se copian del
     * registro acá, no llegan del cliente (criterio técnico de BE-20.1).
     *
     * @throws {BadRequestException} si no viene ninguna calificación.
     * @throws {NotFoundException} si el registro no existe.
     * @throws {ForbiddenException} si el registro es de otro miembro.
     * @throws {ConflictException} si no asistió, se venció el plazo o ya la calificó.
     */
    async crear(usuarioId: string, datos: CrearResenaDto): Promise<ResenaResponseDto> {
        if (!hayAlgunaCalificacion(datos)) {
            throw new BadRequestException(CALIFICA_AL_MENOS_UN_ASPECTO);
        }

        const miembroId = await this.miembroDe(usuarioId);
        const registro = await this.resenaRepository.findRegistro(datos.tipo, datos.registroId);

        if (!registro) throw new NotFoundException(REGISTRO_NO_EXISTE);
        if (registro.miembroId !== miembroId) {
            throw new ForbiddenException(REGISTRO_DE_OTRO_MIEMBRO);
        }
        if (!registro.asistio) throw new ConflictException(SIN_ASISTENCIA);
        if (registro.yaCalificada) throw new ConflictException(YA_CALIFICADA);
        if (!dentroDelPlazo(registro.fin, new Date())) {
            throw new ConflictException(FUERA_DE_PLAZO);
        }

        const resena = await this.resenaRepository.crear({
            tipo: datos.tipo,
            registroId: datos.registroId,
            miembroId,
            entrenadorId: registro.entrenadorId,
            tipoClaseId: registro.tipoClaseId,
            calActividad: datos.calActividad,
            calEntrenador: datos.calEntrenador,
            calInstalaciones: datos.calInstalaciones,
            comentario: datos.comentario,
        });

        return ResenaResponseDto.fromEntity(resena);
    }

    private async miembroDe(usuarioId: string): Promise<string> {
        const miembroId = await this.resenaRepository.findMiembroIdDeUsuario(usuarioId);
        if (!miembroId) throw new ForbiddenException(SIN_FICHA_DE_MIEMBRO);
        return miembroId;
    }
}
