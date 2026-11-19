import { ApiProperty } from '@nestjs/swagger';
import { MarcaAsistencia, TipoActividad } from './marcar-asistencia.dto.js';

// Una marca ya guardada, con la fecha y hora del registro (H19).
export class MarcaGuardadaDto {
    @ApiProperty({ enum: TipoActividad, example: TipoActividad.CLASE })
    tipo!: TipoActividad;

    @ApiProperty({ format: 'uuid' })
    registroId!: string;

    @ApiProperty({ enum: MarcaAsistencia, example: MarcaAsistencia.ASISTIO })
    asistencia!: MarcaAsistencia;

    @ApiProperty({ format: 'date-time' })
    registradaEn!: string;
}
