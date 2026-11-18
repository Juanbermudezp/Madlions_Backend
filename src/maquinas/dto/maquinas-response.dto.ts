import { ApiProperty } from '@nestjs/swagger';
import { EstadoMaquina } from '@PrismaClient';
import { MaquinaResponseDto } from './maquina-response.dto.js';

// Cuántas máquinas hay en cada estado.
export class ResumenMaquinasDto implements Record<EstadoMaquina, number> {
    @ApiProperty({ example: 10 })
    OPERATIVA!: number;

    @ApiProperty({ example: 1 })
    EN_MANTENIMIENTO!: number;

    @ApiProperty({ example: 1 })
    FUERA_DE_SERVICIO!: number;
}

// Respuesta de GET /maquinas (H17).

export class MaquinasResponseDto {
    @ApiProperty({ type: ResumenMaquinasDto })
    resumen!: ResumenMaquinasDto;

    @ApiProperty({ type: MaquinaResponseDto, isArray: true })
    maquinas!: MaquinaResponseDto[];
}
