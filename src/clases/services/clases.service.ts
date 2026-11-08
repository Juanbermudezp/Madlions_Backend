import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClaseRepository, type ClaseConRelaciones, type DatosClase } from '@Clases/repositories';
import { ActividadTraslapadaError, ClaseNoModificableError } from '@Clases/errors';
import {
  ClaseAgendaResponseDto,
  ClaseResponseDto,
  type EntrenadorResumenDto,
  type CreateClaseDto,
  type UpdateClaseDto,
} from '@Clases/dto';
import { aFechaLocal, hoyLocal, rangoDeSemana } from '@Common/fechas';
import { EstadoClase } from '@PrismaClient';
import { horaLocal, validarHorarioClase, type HorarioClase } from './reglas-clase.js';

export const MENSAJES_CLASE = {
  noExiste: 'La clase no existe.',
  tipoInvalido: 'El tipo de clase no existe o está inactivo.',
  entrenadorInvalido: 'El entrenador no existe o no tiene rol de entrenador.',
  traslape: 'El entrenador ya tiene una actividad en ese horario',
  cancelada: 'No se puede modificar una clase cancelada',
  iniciada: 'No se puede modificar una clase que ya empezó o terminó',
  noModificable: 'La clase ya no se puede modificar',
  cupoMenorQueReservas: (reservas: number) =>
    `El cupo no puede ser menor que las reservas confirmadas (${reservas})`,
} as const;

@Injectable()
export class ClasesService {
  constructor(private readonly claseRepository: ClaseRepository) {}

  /** H8: clases programadas del entrenador autenticado en una semana. */
  async listarSemana(
    entrenadorId: string,
    semana?: string,
  ): Promise<ClaseResponseDto[]> {
    const { desde, hasta } = rangoDeSemana(semana ?? hoyLocal());
    const clases = await this.claseRepository.findProgramadasDelEntrenadorEntre(
      entrenadorId,
      desde,
      hasta,
    );
    return clases.map((clase) => ClaseResponseDto.fromEntity(clase));
  }

  /** H4: agenda semanal (lunes a domingo) con todas las clases de la semana. */
  async listarAgenda(
    semana?: string,
    ahora: Date = new Date(),
  ): Promise<ClaseAgendaResponseDto[]> {
    const { desde, hasta } = rangoDeSemana(semana ?? hoyLocal(ahora));
    const clases = await this.claseRepository.findEntre(desde, hasta);
    return this.aAgenda(clases, ahora);
  }

  /** H4: entrenadores activos para el formulario de clases del administrador. */
  async listarEntrenadores(): Promise<EntrenadorResumenDto[]> {
    const entrenadores = await this.claseRepository.findEntrenadoresActivos();
    return entrenadores.map((e) => ({ id: e.id, nombre: `${e.nombre} ${e.apellido}` }));
  }

  /** H4: el administrador programa una clase nueva. */
  async crear(
    dto: CreateClaseDto,
    ahora: Date = new Date(),
  ): Promise<ClaseAgendaResponseDto> {
    this.validarHorario(dto, ahora);
    await this.validarTipoClase(dto.tipoClaseId);
    await this.validarEntrenador(dto.entrenadorId);

    const data: DatosClase = {
      tipoClaseId: dto.tipoClaseId,
      entrenadorId: dto.entrenadorId,
      descripcion: dto.descripcion || null,
      ...this.instantes(dto),
      cupoMaximo: dto.cupoMaximo,
    };

    try {
      const clase = await this.claseRepository.crearSinTraslape(data);
      return ClaseAgendaResponseDto.fromEntity(clase, 0, ahora);
    } catch (error) {
      throw this.traducirError(error);
    }
  }

  /**
   * H4: el administrador modifica una clase PROGRAMADA que aún no empieza.
   * Los campos que no vienen en el cuerpo se toman de la clase actual.
   */
  async actualizar(
    id: string,
    dto: UpdateClaseDto,
    ahora: Date = new Date(),
  ): Promise<ClaseAgendaResponseDto> {
    const actual = await this.claseRepository.findById(id);
    if (!actual) {
      throw new NotFoundException(MENSAJES_CLASE.noExiste);
    }
    if (actual.estado === EstadoClase.CANCELADA_GIMNASIO) {
      throw new ConflictException(MENSAJES_CLASE.cancelada);
    }
    if (actual.inicio <= ahora) {
      throw new ConflictException(MENSAJES_CLASE.iniciada);
    }

    const horario: HorarioClase = {
      fecha: dto.fecha ?? hoyLocal(actual.inicio),
      horaInicio: dto.horaInicio ?? horaLocal(actual.inicio),
      horaFin: dto.horaFin ?? horaLocal(actual.fin),
    };
    this.validarHorario(horario, ahora);

    if (dto.tipoClaseId !== undefined && dto.tipoClaseId !== actual.tipoClaseId) {
      await this.validarTipoClase(dto.tipoClaseId);
    }
    if (dto.entrenadorId !== undefined && dto.entrenadorId !== actual.entrenadorId) {
      await this.validarEntrenador(dto.entrenadorId);
    }

    const reservas = await this.reservasDe(id);
    const cupoMaximo = dto.cupoMaximo ?? actual.cupoMaximo;
    if (cupoMaximo < reservas) {
      throw new ConflictException(MENSAJES_CLASE.cupoMenorQueReservas(reservas));
    }

    const data: DatosClase = {
      tipoClaseId: dto.tipoClaseId ?? actual.tipoClaseId,
      entrenadorId: dto.entrenadorId ?? actual.entrenadorId,
      descripcion:
        dto.descripcion === undefined ? actual.descripcion : dto.descripcion || null,
      ...this.instantes(horario),
      cupoMaximo,
    };

    try {
      const clase = await this.claseRepository.actualizarSinTraslape(id, data, ahora);
      return ClaseAgendaResponseDto.fromEntity(clase, reservas, ahora);
    } catch (error) {
      throw this.traducirError(error);
    }
  }

  private async aAgenda(
    clases: ClaseConRelaciones[],
    ahora: Date,
  ): Promise<ClaseAgendaResponseDto[]> {
    const reservas = await this.claseRepository.contarReservasConfirmadas(
      clases.map((clase) => clase.id),
    );
    return clases.map((clase) =>
      ClaseAgendaResponseDto.fromEntity(clase, reservas.get(clase.id) ?? 0, ahora),
    );
  }

  private async reservasDe(claseId: string): Promise<number> {
    const reservas = await this.claseRepository.contarReservasConfirmadas([claseId]);
    return reservas.get(claseId) ?? 0;
  }

  private validarHorario(horario: HorarioClase, ahora: Date): void {
    const motivo = validarHorarioClase(horario, ahora);
    if (motivo) {
      throw new BadRequestException(motivo);
    }
  }

  private async validarTipoClase(tipoClaseId: string): Promise<void> {
    if (!(await this.claseRepository.existeTipoClaseActivo(tipoClaseId))) {
      throw new BadRequestException(MENSAJES_CLASE.tipoInvalido);
    }
  }

  private async validarEntrenador(entrenadorId: string): Promise<void> {
    if (!(await this.claseRepository.existeEntrenadorActivo(entrenadorId))) {
      throw new BadRequestException(MENSAJES_CLASE.entrenadorInvalido);
    }
  }

  /** Fecha y horas de pared (UTC-6) -> instantes que se guardan en UTC. */
  private instantes({ fecha, horaInicio, horaFin }: HorarioClase): {
    inicio: Date;
    fin: Date;
  } {
    return {
      inicio: aFechaLocal(fecha, horaInicio),
      fin: aFechaLocal(fecha, horaFin),
    };
  }

  private traducirError(error: unknown): unknown {
    if (error instanceof ActividadTraslapadaError) {
      return new ConflictException(MENSAJES_CLASE.traslape);
    }
    if (error instanceof ClaseNoModificableError) {
      return new ConflictException(MENSAJES_CLASE.noModificable);
    }
    return error;
  }
}
