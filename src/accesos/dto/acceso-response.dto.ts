import { ApiProperty } from '@nestjs/swagger';
import { EstadoAcceso } from '@PrismaClient';

export class MiembroAccesoDto {
    @ApiProperty({ example: 'María López' })
    nombre!: string;

    @ApiProperty({ example: 'MBR-000001' })
    codigo!: string;
}

export class MiembroIngresoDto extends MiembroAccesoDto {
    @ApiProperty({ format: 'uuid' })
    id!: string;
}

/** Respuesta 201 de POST /accesos/ingreso. */
export class IngresoResponseDto {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty({ type: MiembroIngresoDto })
    miembro!: MiembroIngresoDto;

    @ApiProperty({ type: String, format: 'date-time' })
    ingresoEn!: Date;

    @ApiProperty({ enum: [EstadoAcceso.DENTRO] })
    estado!: EstadoAcceso;

    @ApiProperty({ example: 'VIGENTE', description: 'Estado de la membresía al ingresar (H11).' })
    estadoMembresia!: string;
}

/** Respuesta 200 de POST /accesos/:id/salida. */
export class SalidaResponseDto {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty({ type: String, format: 'date-time' })
    salidaEn!: Date;

    @ApiProperty({ enum: [EstadoAcceso.SALIO] })
    estado!: EstadoAcceso;
}

/** Elemento de GET /accesos/hoy. */
export class AccesoDelDiaDto {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty({ type: MiembroAccesoDto })
    miembro!: MiembroAccesoDto;

    @ApiProperty({ type: String, format: 'date-time' })
    ingresoEn!: Date;

    @ApiProperty({ type: String, format: 'date-time', nullable: true })
    salidaEn!: Date | null;

    @ApiProperty({ enum: EstadoAcceso })
    estado!: EstadoAcceso;
}