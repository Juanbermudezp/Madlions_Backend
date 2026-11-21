import { ApiProperty } from '@nestjs/swagger';
import { EstadoReserva } from '@PrismaClient';

/** Respuesta 200 de POST /reservas/:id/cancelar (BE-6.1). */
export class ReservaCanceladaResponseDto {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty({ enum: [EstadoReserva.CANCELADA_MIEMBRO] })
    estado!: EstadoReserva;

    @ApiProperty({ example: 4, description: 'Lugares que quedan en la clase después de liberar este.' })
    lugaresDisponibles!: number;
}
