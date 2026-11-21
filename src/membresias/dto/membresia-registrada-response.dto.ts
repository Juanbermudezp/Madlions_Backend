import { ApiProperty } from '@nestjs/swagger';
import { EstadoMembresia, TipoOperacionMembresia, TipoPlan } from '@PrismaClient';

class PlanRegistradoDto {
    @ApiProperty({ format: 'uuid' }) id!: string;
    @ApiProperty({ example: 'Mensual ilimitado' }) nombre!: string;
    @ApiProperty({ enum: TipoPlan }) tipo!: TipoPlan;
}

/** Respuesta 201 de POST /membresias. */
export class MembresiaRegistradaResponseDto {
    @ApiProperty({ format: 'uuid' }) id!: string;
    @ApiProperty({ enum: TipoOperacionMembresia }) tipoOperacion!: TipoOperacionMembresia;
    @ApiProperty({ enum: [EstadoMembresia.PENDIENTE_PAGO] }) estado!: EstadoMembresia;
    @ApiProperty({ type: PlanRegistradoDto }) plan!: PlanRegistradoDto;
    @ApiProperty({ example: 35.5 }) precio!: number;
    @ApiProperty({ format: 'uuid' }) cobroId!: string;
}
