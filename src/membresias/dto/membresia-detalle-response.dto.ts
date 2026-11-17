import { ApiProperty } from '@nestjs/swagger';
import { EstadoMembresia, TipoOperacionMembresia, TipoPlan } from '@PrismaClient';

/** Respuesta de GET /membresias/:id (solo la membresía propia). Fechas AAAA-MM-DD. */
export class MembresiaDetalleResponseDto {
    @ApiProperty({ format: 'uuid' }) id!: string;
    @ApiProperty({ example: 'Mensual ilimitado' }) plan!: string;
    @ApiProperty({ enum: TipoPlan }) tipoPlan!: TipoPlan;
    @ApiProperty({ enum: TipoOperacionMembresia }) tipoOperacion!: TipoOperacionMembresia;
    @ApiProperty({ enum: EstadoMembresia }) estado!: EstadoMembresia;
    @ApiProperty({ example: 35.5 }) precio!: number;
    @ApiProperty({ type: Number, nullable: true }) cantidadClases!: number | null;
    @ApiProperty({ example: '2026-11-20' }) fechaInicioSolicitada!: string;
    @ApiProperty({ type: String, nullable: true }) fechaInicio!: string | null;
    @ApiProperty({ type: String, nullable: true }) fechaVencimiento!: string | null;
    @ApiProperty({ type: String, format: 'uuid', isArray: true }) tiposClaseIds!: string[];
}
