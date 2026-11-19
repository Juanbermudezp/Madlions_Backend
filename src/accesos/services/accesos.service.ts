import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MiembroDentroError } from '@Accesos/errors';
import { RegistroAccesoRepository } from '@Accesos/repositories';
import type {
    AccesoDelDiaDto,
    IngresoResponseDto,
    RegistrarIngresoDto,
    SalidaResponseDto,
} from '@Accesos/dto';
import { aFechaLocal, hoyLocal, sumarDias } from '@Common/fechas';
import { EstadoMembresiaService } from '@Membresias/services';
import { EstadoAcceso } from '@PrismaClient';
import { motivoValido, requiereMotivo } from './reglas-acceso.js';

/** Mensajes de H10 y H11. */
export const MENSAJES_ACCESO = {
    YA_DENTRO: 'El miembro ya está dentro del gimnasio',
    SIN_INGRESO: 'El miembro no tiene un ingreso abierto',
    MOTIVO_REQUERIDO: 'Se requiere un motivo de excepción',
    MIEMBRO_NO_EXISTE: 'El miembro no existe.',
    REGISTRO_NO_EXISTE: 'El registro de acceso no existe.',
} as const;

/** Registro de ingresos y salidas de los miembros (H10) con la alerta de membresía (H11). */
@Injectable()
export class AccesosService {
    constructor(
        private readonly registroAccesoRepository: RegistroAccesoRepository,
        private readonly estadoMembresiaService: EstadoMembresiaService,
    ) { }

    /**
     * Registra el ingreso de un miembro con la fecha y hora actuales y el
     * usuario de recepción del token.
     *
     * El estado de la membresía se calcula aquí con BE-2.4, nunca se toma del
     * cuerpo (H11). Si es VENCIDA, PENDIENTE_PAGO o SIN_MEMBRESIA, exige un
     * motivo de excepción de 10 a 250 caracteres y lo guarda con el ingreso;
     * en los demás estados el motivo se ignora. `ahora` es solo para las pruebas.
     */
    async registrarIngreso(
        recepcionId: string,
        { miembroId, motivoExcepcion }: RegistrarIngresoDto,
        ahora: Date = new Date(),
    ): Promise<IngresoResponseDto> {
        const miembro = await this.registroAccesoRepository.findMiembro(miembroId);
        if (!miembro) {
            throw new NotFoundException(MENSAJES_ACCESO.MIEMBRO_NO_EXISTE);
        }

        if (await this.registroAccesoRepository.findAbiertoDeMiembro(miembroId)) {
            throw new ConflictException(MENSAJES_ACCESO.YA_DENTRO);
        }

        const { estado: estadoMembresia } = await this.estadoMembresiaService.obtenerEstado(
            miembroId,
            hoyLocal(ahora),
        );

        const conExcepcion = requiereMotivo(estadoMembresia);
        if (conExcepcion && !motivoValido(motivoExcepcion)) {
            throw new ConflictException(MENSAJES_ACCESO.MOTIVO_REQUERIDO);
        }

        try {
            const registro = await this.registroAccesoRepository.crearIngreso({
                miembroId,
                ingresoEn: ahora,
                registradoPorId: recepcionId,
                estadoMembresia,
                motivoExcepcion: conExcepcion ? motivoExcepcion!.trim() : null,
            });
            return {
                id: registro.id,
                miembro: {
                    id: miembro.id,
                    nombre: `${miembro.usuario.nombre} ${miembro.usuario.apellido}`,
                    codigo: miembro.codigoMiembro,
                },
                ingresoEn: registro.ingresoEn,
                estado: EstadoAcceso.DENTRO,
                estadoMembresia,
            };
        } catch (error) {
            if (error instanceof MiembroDentroError) {
                throw new ConflictException(MENSAJES_ACCESO.YA_DENTRO);
            }
            throw error;
        }
    }

    /**
     * Registra la salida sobre el mismo registro de ingreso, con la hora
     * actual y el usuario de recepción del token. Solo si sigue DENTRO.
     */
    async registrarSalida(
        recepcionId: string,
        registroId: string,
        ahora: Date = new Date(),
    ): Promise<SalidaResponseDto> {
        if (!(await this.registroAccesoRepository.findById(registroId))) {
            throw new NotFoundException(MENSAJES_ACCESO.REGISTRO_NO_EXISTE);
        }

        const registro = await this.registroAccesoRepository.registrarSalida(registroId, recepcionId, ahora);
        if (!registro) {
            throw new ConflictException(MENSAJES_ACCESO.SIN_INGRESO);
        }

        return { id: registro.id, salidaEn: registro.salidaEn!, estado: EstadoAcceso.SALIO };
    }

    /** Ingresos del día en hora de El Salvador (UTC-6), el más reciente primero. */
    async listarHoy(ahora: Date = new Date()): Promise<AccesoDelDiaDto[]> {
        const hoy = hoyLocal(ahora);
        const registros = await this.registroAccesoRepository.findEntre(
            aFechaLocal(hoy, '00:00'),
            aFechaLocal(sumarDias(hoy, 1), '00:00'),
        );
        return registros.map((r) => ({
            id: r.id,
            miembro: {
                nombre: `${r.miembro.usuario.nombre} ${r.miembro.usuario.apellido}`,
                codigo: r.miembro.codigoMiembro,
            },
            ingresoEn: r.ingresoEn,
            salidaEn: r.salidaEn,
            estado: r.estado,
        }));
    }
}