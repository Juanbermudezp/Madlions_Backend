import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { ActividadTraslapadaError, ClaseNoModificableError } from '@Clases/errors';
import {
  EstadoClase,
  Rol,
  type Clase,
  type Prisma,
  type TipoClase,
} from '@PrismaClient';

/** Clase con su tipo y los datos públicos de su entrenador. */
export type ClaseConRelaciones = Clase & {
  tipoClase: TipoClase;
  entrenador: { id: string; nombre: string; apellido: string };
};

/** Datos completos que se guardan al crear o modificar una clase. */
export interface DatosClase {
  tipoClaseId: string;
  entrenadorId: string;
  descripcion: string | null;
  inicio: Date;
  fin: Date;
  cupoMaximo: number;
}

const INCLUIR_RELACIONES = {
  tipoClase: true,
  entrenador: { select: { id: true, nombre: true, apellido: true } },
} as const;

/** Único punto que habla con la tabla `clase`. */
@Injectable()
export class ClaseRepository {
  constructor(private readonly prisma: PrismaService) {}

  findProgramadasDelEntrenadorEntre(
    entrenadorId: string,
    desde: Date,
    hasta: Date,
  ): Promise<(Clase & { tipoClase: TipoClase })[]> {
    return this.prisma.clase.findMany({
      where: {
        entrenadorId,
        estado: EstadoClase.PROGRAMADA,
        inicio: { lt: hasta },
        fin: { gt: desde },
      },
      include: { tipoClase: true },
      orderBy: { inicio: 'asc' },
    });
  }

  /** Todas las clases (de cualquier estado) que empiezan en [desde, hasta). */
  findEntre(desde: Date, hasta: Date): Promise<ClaseConRelaciones[]> {
    return this.prisma.clase.findMany({
      where: { inicio: { gte: desde, lt: hasta } },
      include: INCLUIR_RELACIONES,
      orderBy: { inicio: 'asc' },
    });
  }

  findById(id: string): Promise<ClaseConRelaciones | null> {
    return this.prisma.clase.findUnique({
      where: { id },
      include: INCLUIR_RELACIONES,
    });
  }

  async existeTipoClaseActivo(id: string): Promise<boolean> {
    const total = await this.prisma.tipoClase.count({ where: { id, activo: true } });
    return total > 0;
  }

  async existeEntrenadorActivo(id: string): Promise<boolean> {
    const total = await this.prisma.user.count({
      where: { id, rol: Rol.ENTRENADOR, isActive: true },
    });
    return total > 0;
  }

  /**
   * Reservas confirmadas por clase.
   *
   * La tabla `reserva` llega con H5 (DB-5.1). Mientras no exista, ninguna
   * clase tiene reservas; cuando exista, este es el único método que cambia:
   * contar las reservas CONFIRMADA de cada clase con un groupBy.
   */
  contarReservasConfirmadas(claseIds: string[]): Promise<Map<string, number>> {
    return Promise.resolve(new Map(claseIds.map((id) => [id, 0])));
  }

  /** @throws {ActividadTraslapadaError} si el entrenador ya tiene algo en ese horario. */
  crearSinTraslape(data: DatosClase): Promise<ClaseConRelaciones> {
    return this.prisma.$transaction(async (tx) => {
      await this.bloquearEntrenador(tx, data.entrenadorId);
      await this.asegurarSinTraslape(tx, data);
      return tx.clase.create({ data, include: INCLUIR_RELACIONES });
    });
  }

  /**
   * Guarda los datos nuevos solo si la clase sigue PROGRAMADA y sin empezar.
   *
   * @throws {ActividadTraslapadaError} si el nuevo horario choca.
   * @throws {ClaseNoModificableError} si la clase se canceló o empezó mientras tanto.
   */
  actualizarSinTraslape(
    id: string,
    data: DatosClase,
    ahora: Date,
  ): Promise<ClaseConRelaciones> {
    return this.prisma.$transaction(async (tx) => {
      await this.bloquearEntrenador(tx, data.entrenadorId);
      await this.asegurarSinTraslape(tx, data, id);

      const { count } = await tx.clase.updateMany({
        where: { id, estado: EstadoClase.PROGRAMADA, inicio: { gt: ahora } },
        data,
      });
      if (count === 0) {
        throw new ClaseNoModificableError();
      }

      return tx.clase.findUniqueOrThrow({ where: { id }, include: INCLUIR_RELACIONES });
    });
  }

  /**
   * Mismo candado que usa H8 al crear bloques (BloqueRepository): así una
   * clase y un bloque del mismo entrenador no se pueden crear a la vez en el
   * mismo horario.
   */
  private async bloquearEntrenador(
    tx: Prisma.TransactionClient,
    entrenadorId: string,
  ): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${entrenadorId}::text))`;
  }

  /**
   * Traslape: otra clase PROGRAMADA o un bloque del mismo entrenador con
   * inicio < nuevoFin y fin > nuevoInicio. Los bordes que solo se tocan
   * (una termina 08:00 y la otra empieza 08:00) no son traslape.
   * Las sesiones personales (H9) se agregan aquí cuando exista su tabla.
   */
  private async asegurarSinTraslape(
    tx: Prisma.TransactionClient,
    { entrenadorId, inicio, fin }: DatosClase,
    excluirClaseId?: string,
  ): Promise<void> {
    const traslape = { inicio: { lt: fin }, fin: { gt: inicio } };

    const clases = await tx.clase.count({
      where: {
        entrenadorId,
        estado: EstadoClase.PROGRAMADA,
        ...traslape,
        ...(excluirClaseId ? { id: { not: excluirClaseId } } : {}),
      },
    });
    const bloques = await tx.bloqueDisponibilidad.count({
      where: { entrenadorId, ...traslape },
    });

    if (clases + bloques > 0) {
      throw new ActividadTraslapadaError();
    }
  }
}
