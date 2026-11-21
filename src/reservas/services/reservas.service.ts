import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { hoyLocal, rangoDeSemana } from '@Common/fechas';
import { assertOwnership } from '@Common/ownership';
import { AvisosService } from '@Avisos/services';
import { ClaseRepository } from '@Clases/repositories';
import { EstadoMembresiaService } from '@Membresias/services';
import { ReservaRepository, type ClaseBloqueada } from '@Reservas/repositories';
import {
    ClaseReservableResponseDto,
    MiReservaResponseDto,
    ReservaCanceladaResponseDto,
    ReservaCreadaResponseDto,
} from '@Reservas/dto';
import { EstadoClase, EstadoReserva, ModuloOrigen, Prisma } from '@PrismaClient';
import {
    RECHAZOS_CANCELACION,
    RECHAZOS_RESERVA,
    avisoReservaConfirmada,
    limiteCancelacion,
    motivoDeRechazo,
    motivoDeRechazoCancelacion,
    semanaReservable,
    type PestanaReservas,
} from './reglas-reserva.js';

export const MENSAJE_CLASE_NO_EXISTE = 'La clase no existe.';
export const MENSAJE_RESERVA_NO_EXISTE = 'La reserva no existe.';
export const MENSAJE_RESERVA_AJENA = 'No tienes permiso para cancelar esta reserva.';

/**
 * Reservas de clases grupales (H5). El miembro siempre sale del token
 * (`usuarioId`): ningún endpoint acepta un id de miembro.
 */
@Injectable()
export class ReservasService {
    private readonly logger = new Logger(ReservasService.name);

    constructor(
        private readonly reservaRepository: ReservaRepository,
        private readonly claseRepository: ClaseRepository,
        private readonly estadoMembresia: EstadoMembresiaService,
        private readonly avisosService: AvisosService,
    ) { }

    /**
     * BE-5.1 · Clases PROGRAMADAS de la semana que aún no empiezan, con los
     * lugares disponibles y si el miembro ya las reservó.
     *
     * @throws {BadRequestException} si la semana no es la actual ni la siguiente.
     */
    async listarReservables(
        usuarioId: string,
        semana: string | undefined,
        ahora: Date = new Date(),
    ): Promise<ClaseReservableResponseDto[]> {
        const resultado = semanaReservable(semana, ahora);
        if ('error' in resultado) throw new BadRequestException(resultado.error);

        const { desde, hasta } = rangoDeSemana(resultado.lunes);
        const clases = (await this.claseRepository.findEntre(desde, hasta)).filter(
            (clase) => clase.estado === EstadoClase.PROGRAMADA && clase.inicio > ahora,
        );
        if (clases.length === 0) return [];

        const ids = clases.map((clase) => clase.id);
        const miembroId = await this.reservaRepository.findMiembroIdDeUsuario(usuarioId);
        const [reservas, reservadas] = await Promise.all([
            this.claseRepository.contarReservasConfirmadas(ids),
            miembroId
                ? this.reservaRepository.findClasesReservadasPor(miembroId, ids)
                : Promise.resolve(new Set<string>()),
        ]);

        return clases.map((clase) =>
            ClaseReservableResponseDto.fromEntity(
                clase,
                reservas.get(clase.id) ?? 0,
                reservadas.has(clase.id),
            ),
        );
    }

    /** BE-5.1 · Reservas propias del miembro autenticado, por pestaña. */
    async listarMias(
        usuarioId: string,
        pestana: PestanaReservas = 'proximas',
        ahora: Date = new Date(),
    ): Promise<MiReservaResponseDto[]> {
        const miembroId = await this.reservaRepository.findMiembroIdDeUsuario(usuarioId);
        if (!miembroId) return [];
        const reservas = await this.reservaRepository.findDelMiembro(miembroId, pestana, ahora);
        return reservas.map((reserva) => MiReservaResponseDto.fromEntity(reserva, ahora));
    }

    /**
     * BE-5.2 · Reserva un cupo para el miembro autenticado.
     *
     * Todo ocurre en una transacción que bloquea primero la fila de la clase
     * (SELECT … FOR UPDATE): dos miembros que piden el último lugar al mismo
     * tiempo quedan en fila y el segundo ve "La clase está llena". Después de
     * confirmar la transacción se envía el aviso "Reserva confirmada"; si el
     * aviso falla, la reserva no se revierte y el error queda en el log.
     *
     * @throws {NotFoundException} si la clase no existe.
     * @throws {ConflictException} con el motivo de rechazo (RECHAZOS_RESERVA).
     */
    async reservar(
        usuarioId: string,
        claseId: string,
        ahora: Date = new Date(),
    ): Promise<ReservaCreadaResponseDto> {
        const miembroId = await this.reservaRepository.findMiembroIdDeUsuario(usuarioId);
        if (!miembroId) throw new ConflictException(RECHAZOS_RESERVA.sinMembresiaVigente);

        const membresia = await this.estadoMembresia.obtenerEstado(miembroId, hoyLocal(ahora));

        let resultado: { reservaId: string; clase: ClaseBloqueada; lugaresDisponibles: number };
        try {
            resultado = await this.reservaRepository.transaccion(async (tx) => {
                const clase = await this.reservaRepository.bloquearClase(tx, claseId);
                if (!clase) throw new NotFoundException(MENSAJE_CLASE_NO_EXISTE);

                const membresiaId = membresia.membresiaId;
                if (membresiaId) await this.reservaRepository.bloquearMembresia(tx, membresiaId);

                const [creditosUsados, confirmadas, yaReservada, tieneTraslape] = await Promise.all([
                    membresiaId ? this.reservaRepository.contarConfirmadasDeMembresia(tx, membresiaId) : 0,
                    this.reservaRepository.contarConfirmadasDeClase(tx, claseId),
                    this.reservaRepository.existeConfirmada(tx, claseId, miembroId),
                    this.reservaRepository.tieneTraslape(tx, miembroId, claseId, clase.inicio, clase.fin),
                ]);

                const motivo = motivoDeRechazo({
                    ahora,
                    clase,
                    membresia,
                    creditosUsados,
                    reservasConfirmadasDeLaClase: confirmadas,
                    yaReservada,
                    tieneTraslape,
                });
                if (motivo) throw new ConflictException(motivo);

                const reserva = await this.reservaRepository.crear(tx, {
                    claseId,
                    miembroId,
                    membresiaId: membresiaId!,
                });
                return {
                    reservaId: reserva.id,
                    clase,
                    lugaresDisponibles: clase.cupoMaximo - confirmadas - 1,
                };
            });
        } catch (error) {
            // El índice único parcial (clase, miembro) cuando CONFIRMADA es la
            // última barrera contra un doble clic del mismo miembro.
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                throw new ConflictException(RECHAZOS_RESERVA.yaReservada);
            }
            throw error;
        }

        await this.enviarAvisoConfirmacion(miembroId, resultado.reservaId, resultado.clase);

        return {
            id: resultado.reservaId,
            estado: EstadoReserva.CONFIRMADA,
            lugaresDisponibles: resultado.lugaresDisponibles,
        };
    }

    /**
     * BE-6.1 · El miembro autenticado cancela su propia reserva.
     *
     * La reserva pasa a CANCELADA_MIEMBRO con la fecha de cancelación. El
     * lugar de la clase y el crédito del set se liberan solos, porque ambos
     * se calculan contando las reservas CONFIRMADA. El UPDATE va condicionado
     * a que siga CONFIRMADA y a que la clase empiece en 2 horas o más, así que
     * dos cancelaciones simultáneas no se aplican dos veces.
     *
     * @throws {NotFoundException} si la reserva no existe.
     * @throws {ForbiddenException} si es de otro miembro (la reserva no cambia).
     * @throws {ConflictException} "Esta reserva ya fue cancelada" o
     *   "Solo puedes cancelar hasta 2 horas antes del inicio de la clase".
     */
    async cancelar(
        usuarioId: string,
        reservaId: string,
        ahora: Date = new Date(),
    ): Promise<ReservaCanceladaResponseDto> {
        const reserva = await this.reservaRepository.findParaCancelar(reservaId);
        if (!reserva) throw new NotFoundException(MENSAJE_RESERVA_NO_EXISTE);
        assertOwnership(reserva.usuarioId, usuarioId, MENSAJE_RESERVA_AJENA);

        const motivo = motivoDeRechazoCancelacion({ estado: reserva.estado, inicioClase: reserva.inicioClase, ahora });
        if (motivo) throw new ConflictException(motivo);

        const lugaresDisponibles = await this.reservaRepository.transaccion(async (tx) => {
            const cancelada = await this.reservaRepository.cancelarConfirmada(
                tx,
                reservaId,
                limiteCancelacion(ahora),
                ahora,
            );
            if (!cancelada) return null;
            const confirmadas = await this.reservaRepository.contarConfirmadasDeClase(tx, reserva.claseId);
            return reserva.cupoMaximo - confirmadas;
        });

        if (lugaresDisponibles === null) {
            // Algo cambió entre la lectura y el UPDATE: otra petición la canceló
            // (doble clic) o se movió la clase. Se vuelve a leer para dar el motivo real.
            const actual = await this.reservaRepository.findParaCancelar(reservaId);
            const motivoActual =
                actual && motivoDeRechazoCancelacion({ estado: actual.estado, inicioClase: actual.inicioClase, ahora });
            throw new ConflictException(motivoActual || RECHAZOS_CANCELACION.yaCancelada);
        }

        return { id: reserva.id, estado: EstadoReserva.CANCELADA_MIEMBRO, lugaresDisponibles };
    }

    /** Aviso "Reserva confirmada" por el servicio del Módulo 9 (H22). Nunca lanza. */
    private async enviarAvisoConfirmacion(
        miembroId: string,
        reservaId: string,
        clase: ClaseBloqueada,
    ): Promise<void> {
        try {
            await this.avisosService.enviar({
                destinatarios: [miembroId],
                moduloOrigen: ModuloOrigen.CLASES,
                referencia: `reserva-${reservaId}-confirmada`,
                ...avisoReservaConfirmada(clase),
            });
        } catch (error) {
            this.logger.error(
                `No se pudo enviar el aviso de la reserva ${reservaId}; la reserva sigue confirmada.`,
                error instanceof Error ? error.stack : String(error),
            );
        }
    }
}
