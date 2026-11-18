import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { hoyLocal, rangoDeSemana } from '@Common/fechas';
import { AvisosService } from '@Avisos/services';
import { ClaseRepository } from '@Clases/repositories';
import { EstadoMembresiaService } from '@Membresias/services';
import { ReservaRepository, type ClaseBloqueada } from '@Reservas/repositories';
import {
    ClaseReservableResponseDto,
    MiReservaResponseDto,
    ReservaCreadaResponseDto,
} from '@Reservas/dto';
import { EstadoClase, EstadoReserva, ModuloOrigen, Prisma } from '@PrismaClient';
import {
    RECHAZOS_RESERVA,
    avisoReservaConfirmada,
    motivoDeRechazo,
    semanaReservable,
    type PestanaReservas,
} from './reglas-reserva.js';

export const MENSAJE_CLASE_NO_EXISTE = 'La clase no existe.';

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
