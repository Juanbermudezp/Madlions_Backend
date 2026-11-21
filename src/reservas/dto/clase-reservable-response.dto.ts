import { ApiProperty } from '@nestjs/swagger';
import { EntrenadorResumenDto, TipoClaseResumenDto } from '@Clases/dto';
import type { ClaseConRelaciones } from '@Clases/repositories';

/** Clase que el miembro puede reservar en "Clases de la semana" (BE-5.1). */
export class ClaseReservableResponseDto {
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

    @ApiProperty({ example: 20, description: 'Cupo máximo de la clase (1 a 50).' })
    cupoMaximo!: number;

    @ApiProperty({ example: 12, description: 'Cupo máximo − reservas confirmadas. 0 = clase llena.' })
    lugaresDisponibles!: number;

    @ApiProperty({ example: false, description: 'El miembro autenticado ya tiene una reserva confirmada en esta clase.' })
    yaReservada!: boolean;

    static fromEntity(
        clase: ClaseConRelaciones,
        reservasConfirmadas: number,
        yaReservada: boolean,
    ): ClaseReservableResponseDto {
        return {
            id: clase.id,
            tipo: { id: clase.tipoClase.id, nombre: clase.tipoClase.nombre },
            entrenador: {
                id: clase.entrenador.id,
                nombre: `${clase.entrenador.nombre} ${clase.entrenador.apellido}`,
            },
            inicio: clase.inicio,
            fin: clase.fin,
            cupoMaximo: clase.cupoMaximo,
            lugaresDisponibles: Math.max(clase.cupoMaximo - reservasConfirmadas, 0),
            yaReservada,
        };
    }
}
