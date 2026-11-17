import { randomUUID } from 'node:crypto';
import {
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { BloqueRepository } from '@Bloques/repositories';
import { CobrosService } from '@Cobros/services';
import { hoyLocal } from '@Common/fechas';
import { ConfiguracionService } from '@Configuracion/services';
import { EstadoMembresiaService } from '@Membresias/services';
import { AgendaRechazadaError, MENSAJES_AGENDA } from '@Sesiones/errors';
import { SesionRepository } from '@Sesiones/repositories';
import { SesionAgendadaResponseDto, SesionResponseDto } from '@Sesiones/dto';
import { ConceptoCobro, EstadoBloque, ReferenciaCobro } from '@PrismaClient';
import {
    MAX_SESIONES_PENDIENTES,
    cumpleAnticipacion,
    detalleCobroSesion,
    membresiaPermiteAgendar,
} from './reglas-sesion.js';

export const SIN_FICHA_MIEMBRO = 'Tu usuario no tiene ficha de miembro.';
export const BLOQUE_NO_EXISTE = 'El bloque no existe.';

/** Agendamiento de sesiones personales (H9, BE-9.2). */
@Injectable()
export class SesionesService {
    constructor(
        private readonly sesionRepository: SesionRepository,
        private readonly bloqueRepository: BloqueRepository,
        private readonly estadoMembresiaService: EstadoMembresiaService,
        private readonly configuracionService: ConfiguracionService,
        private readonly cobrosService: CobrosService,
    ) { }

    /**
     * Agenda una sesión sobre un bloque.
     *
     * 1. Fuera de la transacción, las validaciones que no necesitan bloqueos
     *    (estado del bloque, anticipación y membresía). Así una transacción
     *    nunca espera una conexión extra mientras retiene la suya.
     * 2. En una transacción: bloqueo del miembro, bloque a OCUPADO solo si
     *    sigue DISPONIBLE, límite de 5, traslapes, cobro (Módulo 5) y sesión.
     *    Cualquier error deshace todo: no queda ni la sesión, ni el cobro, ni
     *    el bloque ocupado.
     *
     * `usuarioId` sale del token. `ahora` es un parámetro solo para las pruebas.
     */
    async agendar(
        usuarioId: string,
        bloqueId: string,
        ahora: Date = new Date(),
    ): Promise<SesionAgendadaResponseDto> {
        const miembroId = await this.sesionRepository.findMiembroIdDeUsuario(usuarioId);
        if (!miembroId) {
            throw new ForbiddenException(SIN_FICHA_MIEMBRO);
        }

        const bloque = await this.bloqueRepository.findConEntrenador(bloqueId);
        if (!bloque) {
            throw new NotFoundException(BLOQUE_NO_EXISTE);
        }

        try {
            if (bloque.estado !== EstadoBloque.DISPONIBLE) {
                throw new AgendaRechazadaError(MENSAJES_AGENDA.NO_DISPONIBLE);
            }
            if (!cumpleAnticipacion(bloque.inicio, ahora)) {
                throw new AgendaRechazadaError(MENSAJES_AGENDA.ANTICIPACION);
            }

            const [estadoHoy, estadoEnFecha] = await Promise.all([
                this.estadoMembresiaService.obtenerEstado(miembroId, hoyLocal(ahora)),
                this.estadoMembresiaService.obtenerEstado(miembroId, hoyLocal(bloque.inicio)),
            ]);
            if (!membresiaPermiteAgendar(estadoHoy.estado, estadoEnFecha.estado)) {
                throw new AgendaRechazadaError(MENSAJES_AGENDA.MEMBRESIA);
            }

            // Precio vigente en este momento: queda fijo en la sesión y en el cobro.
            const precio = await this.configuracionService.obtenerPrecioClasePuntual();
            const entrenador = `${bloque.entrenador.nombre} ${bloque.entrenador.apellido}`;

            const sesion = await this.sesionRepository.transaccion(async (tx) => {
                await this.sesionRepository.bloquearMiembro(miembroId, tx);

                if (!(await this.bloqueRepository.ocuparSiDisponible(bloqueId, tx))) {
                    throw new AgendaRechazadaError(MENSAJES_AGENDA.NO_DISPONIBLE);
                }
                if ((await this.sesionRepository.contarPendientes(miembroId, ahora, tx)) >= MAX_SESIONES_PENDIENTES) {
                    throw new AgendaRechazadaError(MENSAJES_AGENDA.LIMITE);
                }
                if (await this.sesionRepository.hayTraslape(miembroId, bloque.inicio, bloque.fin, tx)) {
                    throw new AgendaRechazadaError(MENSAJES_AGENDA.TRASLAPE_SESION);
                }
                if (await this.sesionRepository.hayTraslapeConReserva(miembroId, bloque.inicio, bloque.fin, tx)) {
                    throw new AgendaRechazadaError(MENSAJES_AGENDA.TRASLAPE_CLASE);
                }
                // El id de la sesión se genera antes para que el cobro la referencie.
                const id = randomUUID();
                const cobro = await this.cobrosService.crearCobro(
                    {
                        miembroId,
                        concepto: ConceptoCobro.SESION_ADICIONAL,
                        detalle: detalleCobroSesion(entrenador, bloque.inicio),
                        monto: Number(precio),
                        referenciaTipo: ReferenciaCobro.SESION,
                        referenciaId: id,
                    },
                    tx,
                );

                return this.sesionRepository.crear(
                    {
                        id,
                        bloqueId,
                        miembroId,
                        entrenadorId: bloque.entrenadorId,
                        inicio: bloque.inicio,
                        fin: bloque.fin,
                        precio,
                        cobroId: cobro.id,
                    },
                    tx,
                );
            });

            return SesionAgendadaResponseDto.from(sesion, entrenador);
        } catch (error) {
            if (error instanceof AgendaRechazadaError) {
                throw new ConflictException(error.message);
            }
            throw error;
        }
    }

    /** "Mis sesiones": las del miembro autenticado, con el estado de su cobro. */
    async listarMias(usuarioId: string): Promise<SesionResponseDto[]> {
        const sesiones = await this.sesionRepository.findDeUsuario(usuarioId);
        return sesiones.map((s) => SesionResponseDto.fromEntity(s));
    }
}