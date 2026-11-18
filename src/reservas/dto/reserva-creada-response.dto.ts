import { ApiProperty } from '@nestjs/swagger';
import { EstadoReserva } from '@PrismaClient';

/** Respuesta 201 de POST /reservas (BE-5.2). */
export class ReservaCreadaResponseDto {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty({ enum: [EstadoReserva.CONFIRMADA] })
    estado!: EstadoReserva;

    @ApiProperty({ example: 9, description: 'Lugares que quedan en la clase después de esta reserva.' })
    lugaresDisponibles!: number;
}
