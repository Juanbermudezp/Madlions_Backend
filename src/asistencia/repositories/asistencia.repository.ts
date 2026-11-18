import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import {
    AsistenciaReserva,
    AsistenciaSesion,
    EstadoClase,
    EstadoReserva,
    EstadoSesion,
} from '@PrismaClient';
import { TipoActividad, type MarcaAsistencia } from '../dto/marcar-asistencia.dto.js';
import { finMinimoParaListar } from '../services/reglas-asistencia.js';

/** Un miembro de la lista de una actividad. */
export interface MiembroDeActividad {
    registroId: string;
    nombre: string;
    codigo: string;
    asistencia: AsistenciaReserva;
}

/** Clase o sesión con su lista de miembros, ya normalizadas a una sola forma. */
export interface ActividadConMiembros {
    tipo: TipoActividad;
    id: string;
    nombre: string;
    inicio: Date;
    fin: Date;
    miembros: MiembroDeActividad[];
}

/** Lo que hace falta para validar una marca antes de guardarla. */
export interface RegistroParaMarcar {
    registroId: string;
    entrenadorId: string;
    inicio: Date;
    fin: Date;
    /** Solo las reservas se cancelan; en una sesión siempre es true. */
    activo: boolean;
}

const MIEMBRO_CON_USUARIO = {
    select: {
        codigoMiembro: true,
        usuario: { select: { nombre: true, apellido: true } },
    },
} as const;

function nombreDe(miembro: { usuario: { nombre: string; apellido: string } }): string {
    return `${miembro.usuario.nombre} ${miembro.usuario.apellido}`;
}

/** Único punto que habla con la asistencia de reservas y sesiones (H19). */
@Injectable()
export class AsistenciaRepository {
    constructor(private readonly prisma: PrismaService) { }

    /**
     * Clases y sesiones del entrenador que ya empezaron y siguen dentro de la
     * ventana, de la más reciente a la más antigua. Las reservas canceladas no
     * aparecen en la lista (criterio 6).
     */
    async findActividades(entrenadorId: string, ahora: Date): Promise<ActividadConMiembros[]> {
        const desde = finMinimoParaListar(ahora);
        const ventana = { inicio: { lte: ahora }, fin: { gte: desde } };

        const [clases, sesiones] = await Promise.all([
            this.prisma.clase.findMany({
                where: { entrenadorId, estado: EstadoClase.PROGRAMADA, ...ventana },
                orderBy: { inicio: 'desc' },
                include: {
                    tipoClase: { select: { nombre: true } },
                    reservas: {
                        where: { estado: EstadoReserva.CONFIRMADA },
                        include: { miembro: MIEMBRO_CON_USUARIO },
                    },
                },
            }),
            this.prisma.sesionPersonal.findMany({
                where: { entrenadorId, estado: EstadoSesion.AGENDADA, ...ventana },
                orderBy: { inicio: 'desc' },
                include: { miembro: MIEMBRO_CON_USUARIO },
            }),
        ]);

        const deClases: ActividadConMiembros[] = clases.map((clase) => ({
            tipo: TipoActividad.CLASE,
            id: clase.id,
            nombre: clase.tipoClase.nombre,
            inicio: clase.inicio,
            fin: clase.fin,
            miembros: clase.reservas.map((reserva) => ({
                registroId: reserva.id,
                nombre: nombreDe(reserva.miembro),
                codigo: reserva.miembro.codigoMiembro,
                asistencia: reserva.asistencia,
            })),
        }));

        const deSesiones: ActividadConMiembros[] = sesiones.map((sesion) => ({
            tipo: TipoActividad.SESION,
            id: sesion.id,
            nombre: 'Sesión personal',
            inicio: sesion.inicio,
            fin: sesion.fin,
            miembros: [
                {
                    registroId: sesion.id,
                    nombre: nombreDe(sesion.miembro),
                    codigo: sesion.miembro.codigoMiembro,
                    // Los dos enums tienen los mismos valores (H5 y H9).
                    asistencia: sesion.asistencia as unknown as AsistenciaReserva,
                },
            ],
        }));

        return [...deClases, ...deSesiones].sort(
            (a, b) => b.inicio.getTime() - a.inicio.getTime(),
        );
    }

    /** Datos de la reserva o de la sesión para validar la marca; null si no existe. */
    async findRegistro(
        tipo: TipoActividad,
        registroId: string,
    ): Promise<RegistroParaMarcar | null> {
        if (tipo === TipoActividad.CLASE) {
            const reserva = await this.prisma.reserva.findUnique({
                where: { id: registroId },
                select: {
                    id: true,
                    estado: true,
                    clase: { select: { entrenadorId: true, inicio: true, fin: true } },
                },
            });
            if (!reserva) return null;

            return {
                registroId: reserva.id,
                entrenadorId: reserva.clase.entrenadorId,
                inicio: reserva.clase.inicio,
                fin: reserva.clase.fin,
                activo: reserva.estado === EstadoReserva.CONFIRMADA,
            };
        }

        const sesion = await this.prisma.sesionPersonal.findUnique({
            where: { id: registroId },
            select: { id: true, entrenadorId: true, inicio: true, fin: true, estado: true },
        });
        if (!sesion) return null;

        return {
            registroId: sesion.id,
            entrenadorId: sesion.entrenadorId,
            inicio: sesion.inicio,
            fin: sesion.fin,
            activo: sesion.estado === EstadoSesion.AGENDADA,
        };
    }

    /**
     * Guarda todas las marcas de una vez: o entran todas o no entra ninguna.
     * Cada fila deja la marca, quién la registró y cuándo (DB-19.1).
     */
    async marcar(
        marcas: { tipo: TipoActividad; registroId: string; asistencia: MarcaAsistencia }[],
        usuarioId: string,
        registradaEn: Date,
    ): Promise<void> {
        await this.prisma.$transaction(
            marcas.map((marca) =>
                marca.tipo === TipoActividad.CLASE
                    ? this.prisma.reserva.update({
                          where: { id: marca.registroId },
                          data: {
                              asistencia: marca.asistencia as AsistenciaReserva,
                              asistenciaRegistradaPorId: usuarioId,
                              asistenciaRegistradaEn: registradaEn,
                          },
                      })
                    : this.prisma.sesionPersonal.update({
                          where: { id: marca.registroId },
                          data: {
                              asistencia: marca.asistencia as AsistenciaSesion,
                              asistenciaRegistradaPorId: usuarioId,
                              asistenciaRegistradaEn: registradaEn,
                          },
                      }),
            ),
        );
    }
}
