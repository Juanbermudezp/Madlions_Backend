import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { ActividadTraslapadaError, ClaseNoModificableError, ClaseNoCancelableError } from '@Clases/errors';
import {
  EstadoClase,
  EstadoReserva,
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

export interface ReservaCanceladaParaAviso {
  reservaId: string;
  miembroId: string;
  creditoDevuelto: boolean;
}
export interface CancelacionClaseConfirmada {
  clase: { id: string; inicio: Date; fin: Date; tipoClase: { nombre: string }; entrenador: { nombre: string; apellido: string } };
  reservas: ReservaCanceladaParaAviso[];
}

const INCLUIR_RELACIONES = {
  tipoClase: true,
  entrenador: { select: { id: true, nombre: true, apellido: true } },
} as const;

/** Único punto que habla con la tabla `clase`. */
@Injectable()
export class ClaseRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** H7: la actualización condicional toma el mismo lock de fila que H5.
   * Solo un cancelador gana; H4 no puede editar la clase mientras se cancela.
   * UPDATE RETURNING de reservas devuelve únicamente las realmente cambiadas,
   * incluso si H6 canceló una mientras esperábamos: no hay lista obsoleta ni
   * doble devolución. Los créditos se calculan por conteo, sin incrementar nada.
   */
  cancelar(id: string, motivo: string, administradorId: string, ahora: Date): Promise<CancelacionClaseConfirmada> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.clase.updateMany({
        where: { id, estado: EstadoClase.PROGRAMADA, inicio: { gt: ahora } },
        data: { estado: EstadoClase.CANCELADA_GIMNASIO, motivoCancelacion: motivo, canceladaEn: ahora, canceladaPorId: administradorId },
      });
      if (count === 0) {
        const actual = await tx.clase.findUnique({ where: { id }, select: { estado: true } });
        throw new ClaseNoCancelableError(!actual ? 'NO_EXISTE' : actual.estado === EstadoClase.CANCELADA_GIMNASIO ? 'CANCELADA' : 'INICIADA');
      }
      const clase = await tx.clase.findUniqueOrThrow({ where: { id }, select: {
        id: true, inicio: true, fin: true, tipoClase: { select: { nombre: true } },
        entrenador: { select: { nombre: true, apellido: true } },
      } });
      const reservas = await tx.$queryRaw<ReservaCanceladaParaAviso[]>`
        UPDATE reserva AS r
        SET estado = 'CANCELADA_GIMNASIO', cancelada_en = ${ahora}
        FROM membresia AS m
        WHERE r.clase_id = ${id}::uuid AND r.estado = 'CONFIRMADA'
          AND m.id = r.membresia_id
        RETURNING r.id AS "reservaId", r.miembro_id AS "miembroId",
                  (m.tipo_plan = 'SET_CLASES') AS "creditoDevuelto"`;
      return { clase, reservas };
    }, { isolationLevel: 'ReadCommitted' });
  }

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

  /** Entrenadores activos, para elegir quién imparte una clase. */
  findEntrenadoresActivos(): Promise<{ id: string; nombre: string; apellido: string }[]> {
    return this.prisma.user.findMany({
      where: { rol: Rol.ENTRENADOR, isActive: true },
      select: { id: true, nombre: true, apellido: true },
      orderBy: [{ nombre: 'asc' }, { apellido: 'asc' }],
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
   * Reservas CONFIRMADA por clase (DB-5.1). Las clases sin reservas vuelven
   * con 0, así que el mapa siempre trae todos los ids pedidos.
   */
  async contarReservasConfirmadas(claseIds: string[]): Promise<Map<string, number>> {
    const conteo = new Map(claseIds.map((id) => [id, 0]));
    if (claseIds.length === 0) return conteo;
    const grupos = await this.prisma.reserva.groupBy({
      by: ['claseId'],
      where: { claseId: { in: claseIds }, estado: EstadoReserva.CONFIRMADA },
      _count: { _all: true },
    });
    for (const g of grupos) conteo.set(g.claseId, g._count._all);
    return conteo;
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
