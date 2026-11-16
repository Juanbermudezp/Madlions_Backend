import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { EstadoCobro } from '@PrismaClient';

export const ESTADO_COBRO_INVALIDO = 'El estado debe ser PENDIENTE o PAGADO.';

/** Query de GET /cobros/mios. Sin `estado`, devuelve todos. */
export class CobrosQueryDto {
    @ApiPropertyOptional({ enum: EstadoCobro })
    @IsOptional()
    @IsIn(Object.values(EstadoCobro), { message: ESTADO_COBRO_INVALIDO })
    estado?: EstadoCobro;
}
