import { ApiProperty } from '@nestjs/swagger';
import type { TipoClase } from '@PrismaClient';

export class TipoClaseResponseDto {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty({ example: 'Yoga' })
    nombre!: string;

    @ApiProperty({ example: 'Posturas, respiración y flexibilidad.' })
    descripcion!: string;

    static fromEntity(tipo: TipoClase): TipoClaseResponseDto {
        return {
            id: tipo.id,
            nombre: tipo.nombre,
            descripcion: tipo.descripcion,
        };
    }
}
