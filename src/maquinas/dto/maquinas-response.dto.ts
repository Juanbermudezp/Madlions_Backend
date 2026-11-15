import { ApiProperty } from '@nestjs/swagger';
import { EstadoMaquina } from '@PrismaClient';
import { MaquinaResponseDto } from './maquina-response.dto.js';

/** Cuántas máquinas hay en cada estado (H17, criterio 1). */
export class ResumenMaquinasDto implements Record<EstadoMaquina, number> {
    @ApiProperty({ example: 10 })
    OPERATIVA!: number;

    @ApiProperty({ example: 1 })
    EN_MANTENIMIENTO!: number;

    @ApiProperty({ example: 1 })
    FUERA_DE_SERVICIO!: number;
}

/**
 * Respuesta de GET /maquinas (H17).
 *
 * `resumen` responde "cuántas hay en cada estado", así que el filtro de estado
 * no lo recorta: filtrar por "En mantenimiento" no deja los otros dos
 * contadores en 0. Los filtros de tipo y zona sí lo acotan, porque el resumen
 * describe el inventario que se está viendo.
 *
 * Para el administrador y el entrenador cada elemento de `maquinas` es un
 * MaquinaInternaResponseDto, que agrega `ultimoMotivo` y `ultimoCambioPor`.
 */
export class MaquinasResponseDto {
    @ApiProperty({ type: ResumenMaquinasDto })
    resumen!: ResumenMaquinasDto;

    @ApiProperty({ type: MaquinaResponseDto, isArray: true })
    maquinas!: MaquinaResponseDto[];
}
