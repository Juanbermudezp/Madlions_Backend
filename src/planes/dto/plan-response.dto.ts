import { ApiProperty } from '@nestjs/swagger';
import { TipoPlan } from '@PrismaClient';
import type { PlanConTiposClase } from '../repositories/plan.repository.js';

export class TipoClaseDePlanDto {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty({ example: 'Yoga' })
    nombre!: string;
}

export class PlanResponseDto {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty({ example: 'Mensual ilimitado' })
    nombre!: string;

    @ApiProperty({ enum: TipoPlan, example: TipoPlan.MENSUAL })
    tipo!: TipoPlan;

    @ApiProperty({ example: 35.5 })
    precio!: number;

    @ApiProperty({ type: Number, nullable: true, example: null })
    cantidadClases!: number | null;

    @ApiProperty({ example: 30 })
    duracionDias!: number;

    @ApiProperty({ example: 'Acceso ilimitado a sala de máquinas.' })
    beneficios!: string;

    @ApiProperty({ example: true })
    activo!: boolean;

    @ApiProperty({ type: TipoClaseDePlanDto, isArray: true })
    tiposClase!: TipoClaseDePlanDto[];

    static fromEntity(plan: PlanConTiposClase): PlanResponseDto {
        return {
            id: plan.id,
            nombre: plan.nombre,
            tipo: plan.tipo,
            precio: plan.precio.toNumber(),
            cantidadClases: plan.cantidadClases,
            duracionDias: plan.duracionDias,
            beneficios: plan.beneficios,
            activo: plan.activo,
            tiposClase: plan.tiposClase
                .map(({ tipoClase }) => ({ id: tipoClase.id, nombre: tipoClase.nombre }))
                .sort((a, b) => a.nombre.localeCompare(b.nombre)),
        };
    }
}
