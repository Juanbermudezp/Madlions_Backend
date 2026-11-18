import { BadRequestException, Injectable } from '@nestjs/common';
import { rangoDeSemana } from '@Common/fechas';
import { ClaseRepository } from '@Clases/repositories';
import { ReservaRepository } from '@Reservas/repositories';
import { ClaseReservableResponseDto, MiReservaResponseDto } from '@Reservas/dto';
import { EstadoClase } from '@PrismaClient';
import { semanaReservable, type PestanaReservas } from './reglas-reserva.js';

/**
 * Reservas de clases grupales (H5). El miembro siempre sale del token
 * (`usuarioId`): ningún endpoint acepta un id de miembro.
 */
@Injectable()
export class ReservasService {
    constructor(
        private readonly reservaRepository: ReservaRepository,
        private readonly claseRepository: ClaseRepository,
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
}
