import { ApiProperty } from '@nestjs/swagger';
import { EntrenadorResumenDto, TipoClaseResumenDto } from '@Clases/dto';
import { ESTADO_IMPARTIDA, estadoVisible, type EstadoVisibleClase } from '@Clases/services';
import { EstadoClase, EstadoReserva } from '@PrismaClient';
import type { ReservaConClase } from '../repositories/reserva.repository.js';

export class ClaseDeReservaDto {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty({ type: TipoClaseResumenDto })
    tipo!: TipoClaseResumenDto;

    @ApiProperty({ type: EntrenadorResumenDto })
    entrenador!: EntrenadorResumenDto;

    @ApiProperty({ type: String, format: 'date-time' })
    inicio!: Date;

    @ApiProperty({ type: String, format: 'date-time' })
    fin!: Date;

    @ApiProperty({ enum: [...Object.values(EstadoClase), ESTADO_IMPARTIDA] })
    estado!: EstadoVisibleClase;
}

/** Una reserva en "Mis reservas" (BE-5.1). */
export class MiReservaResponseDto {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty({ type: ClaseDeReservaDto })
    clase!: ClaseDeReservaDto;

    @ApiProperty({ enum: EstadoReserva })
    estado!: EstadoReserva;

    @ApiProperty({ type: String, format: 'date-time' })
    creadaEn!: Date;

    static fromEntity(reserva: ReservaConClase, ahora: Date): MiReservaResponseDto {
        const { clase } = reserva;
        return {
            id: reserva.id,
            clase: {
                id: clase.id,
                tipo: { id: clase.tipoClase.id, nombre: clase.tipoClase.nombre },
                entrenador: {
                    id: clase.entrenador.id,
                    nombre: `${clase.entrenador.nombre} ${clase.entrenador.apellido}`,
                },
                inicio: clase.inicio,
                fin: clase.fin,
                estado: estadoVisible(clase, ahora),
            },
            estado: reserva.estado,
            creadaEn: reserva.creadaEn,
        };
    }
}
