import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PESTANAS_RESERVAS, type PestanaReservas } from '../services/reglas-reserva.js';

/** Query `?estado=proximas|pasadas` de "Mis reservas". */
export class MisReservasQueryDto {
    @ApiPropertyOptional({ enum: PESTANAS_RESERVAS, default: 'proximas' })
    @IsOptional()
    @IsIn(PESTANAS_RESERVAS, { message: 'El estado debe ser proximas o pasadas.' })
    estado?: PestanaReservas;
}
