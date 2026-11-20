import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { AsistenciaReserva, AsistenciaSesion, type Resena } from '@PrismaClient';
import { TipoActividad } from '../dto/crear-resena.dto.js';
import { finMinimoParaCalificar } from '../services/reglas-resena.js';

/** Clase o sesión que el miembro todavía puede calificar. */
export interface PendientePorCalificar {
    tipo: TipoActividad;
    registroId: string;
    nombre: string;
    entrenador: string;
    fin: Date;
}

/** Lo que hace falta para validar una reseña antes de guardarla. */
export interface RegistroParaCalificar {
    registroId: string;
    miembroId: string;
    entrenadorId: string;
    /** Nulo en las sesiones personales, que no son de un tipo de clase. */
    tipoClaseId: string | null;
    fin: Date;
    asistio: boolean;
    yaCalificada: boolean;
}

/** Datos ya validados de una reseña nueva. */
export interface DatosResena {
    tipo: TipoActividad;
    registroId: string;
    miembroId: string;
    entrenadorId: string;
    tipoClaseId: string | null;
    calActividad?: number;
    calEntrenador?: number;
    calInstalaciones?: number;
    comentario?: string;
}

function nombreDe(usuario: { nombre: string; apellido: string }): string {
    return `${usuario.nombre} ${usuario.apellido}`;
}

/** Único punto que habla con la tabla `resena` (H20). */
@Injectable()
export class ResenaRepository {
    constructor(private readonly prisma: PrismaService) { }

    /** Ficha de miembro del usuario autenticado, o null si no tiene. */
    async findMiembroIdDeUsuario(usuarioId: string): Promise<string | null> {
        const miembro = await this.prisma.miembro.findUnique({
            where: { usuarioId },
            select: { id: true },
        });
        return miembro?.id ?? null;
    }

    /**
     * Clases y sesiones del miembro con asistencia "Asistió", dentro del plazo
     * de 7 días y todavía sin reseña, de la más reciente a la más antigua.
     */
    async findPendientes(miembroId: string, ahora: Date): Promise<PendientePorCalificar[]> {
        const desde = finMinimoParaCalificar(ahora);

        const [reservas, sesiones] = await Promise.all([
            this.prisma.reserva.findMany({
                where: {
                    miembroId,
                    asistencia: AsistenciaReserva.ASISTIO,
                    resena: null,
                    clase: { fin: { gte: desde, lte: ahora } },
                },
                include: {
                    clase: {
                        include: {
                            tipoClase: { select: { nombre: true } },
                            entrenador: { select: { nombre: true, apellido: true } },
                        },
                    },
                },
            }),
            this.prisma.sesionPersonal.findMany({
                where: {
                    miembroId,
                    asistencia: AsistenciaSesion.ASISTIO,
                    resena: null,
                    fin: { gte: desde, lte: ahora },
                },
                include: { entrenador: { select: { nombre: true, apellido: true } } },
            }),
        ]);

        const deClases: PendientePorCalificar[] = reservas.map((reserva) => ({
            tipo: TipoActividad.CLASE,
            registroId: reserva.id,
            nombre: reserva.clase.tipoClase.nombre,
            entrenador: nombreDe(reserva.clase.entrenador),
            fin: reserva.clase.fin,
        }));

        const deSesiones: PendientePorCalificar[] = sesiones.map((sesion) => ({
            tipo: TipoActividad.SESION,
            registroId: sesion.id,
            nombre: 'Sesión personal',
            entrenador: nombreDe(sesion.entrenador),
            fin: sesion.fin,
        }));

        return [...deClases, ...deSesiones].sort((a, b) => b.fin.getTime() - a.fin.getTime());
    }

    /** Datos del registro para validar la reseña; null si no existe. */
    async findRegistro(
        tipo: TipoActividad,
        registroId: string,
    ): Promise<RegistroParaCalificar | null> {
        if (tipo === TipoActividad.CLASE) {
            const reserva = await this.prisma.reserva.findUnique({
                where: { id: registroId },
                select: {
                    id: true,
                    miembroId: true,
                    asistencia: true,
                    resena: { select: { id: true } },
                    clase: { select: { entrenadorId: true, tipoClaseId: true, fin: true } },
                },
            });
            if (!reserva) return null;

            return {
                registroId: reserva.id,
                miembroId: reserva.miembroId,
                entrenadorId: reserva.clase.entrenadorId,
                tipoClaseId: reserva.clase.tipoClaseId,
                fin: reserva.clase.fin,
                asistio: reserva.asistencia === AsistenciaReserva.ASISTIO,
                yaCalificada: reserva.resena !== null,
            };
        }

        const sesion = await this.prisma.sesionPersonal.findUnique({
            where: { id: registroId },
            select: {
                id: true,
                miembroId: true,
                entrenadorId: true,
                fin: true,
                asistencia: true,
                resena: { select: { id: true } },
            },
        });
        if (!sesion) return null;

        return {
            registroId: sesion.id,
            miembroId: sesion.miembroId,
            entrenadorId: sesion.entrenadorId,
            tipoClaseId: null,
            fin: sesion.fin,
            asistio: sesion.asistencia === AsistenciaSesion.ASISTIO,
            yaCalificada: sesion.resena !== null,
        };
    }

    /** Guarda la reseña. El entrenador y el tipo de clase vienen del registro. */
    crear(datos: DatosResena): Promise<Resena> {
        return this.prisma.resena.create({
            data: {
                miembroId: datos.miembroId,
                entrenadorId: datos.entrenadorId,
                tipoClaseId: datos.tipoClaseId,
                ...(datos.tipo === TipoActividad.CLASE
                    ? { reservaId: datos.registroId }
                    : { sesionId: datos.registroId }),
                calActividad: datos.calActividad ?? null,
                calEntrenador: datos.calEntrenador ?? null,
                calInstalaciones: datos.calInstalaciones ?? null,
                comentario: datos.comentario ?? null,
            },
        });
    }
}
