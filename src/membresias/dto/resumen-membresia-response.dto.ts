import { ApiProperty } from '@nestjs/swagger';
import { TipoOperacionMembresia, TipoPlan } from '@PrismaClient';

class MiembroResumenDto {
    @ApiProperty({ format: 'uuid' }) id!: string;
    @ApiProperty({ example: 'María' }) nombre!: string;
    @ApiProperty({ example: 'López' }) apellido!: string;
    @ApiProperty({ example: 'MBR-000002' }) codigo!: string;
}

class TipoClaseResumenDto {
    @ApiProperty({ format: 'uuid' }) id!: string;
    @ApiProperty({ example: 'Yoga' }) nombre!: string;
}

class PlanResumenDto {
    @ApiProperty({ format: 'uuid' }) id!: string;
    @ApiProperty({ example: 'Mensual ilimitado' }) nombre!: string;
    @ApiProperty({ enum: TipoPlan }) tipo!: TipoPlan;
    @ApiProperty({ type: Number, nullable: true, example: null }) cantidadClases!: number | null;
    @ApiProperty({ type: TipoClaseResumenDto, isArray: true }) tiposClase!: TipoClaseResumenDto[];
}

/** Resumen de una compra o renovación antes de confirmarla (H2, criterio 2). */
export class ResumenMembresiaResponseDto {
    @ApiProperty({ type: MiembroResumenDto }) miembro!: MiembroResumenDto;
    @ApiProperty({ type: PlanResumenDto }) plan!: PlanResumenDto;
    @ApiProperty({ example: 35.5, description: 'USD, IVA incluido.' }) precio!: number;
    @ApiProperty({ example: 'Acceso ilimitado a sala de máquinas.' }) beneficios!: string;
    @ApiProperty({ example: 30 }) duracionDias!: number;
    @ApiProperty({ enum: TipoOperacionMembresia }) tipoOperacion!: TipoOperacionMembresia;
    @ApiProperty({ example: '2026-11-20' }) fechaInicio!: string;
    @ApiProperty({ example: '2026-12-19' }) fechaVencimiento!: string;
    @ApiProperty({ description: 'true en la renovación de una membresía vigente: la fecha no se puede cambiar.' })
    fechaInicioFija!: boolean;
}
