import { ApiProperty } from '@nestjs/swagger';

/** Respuesta de GET y PUT /configuracion/precio-clase-puntual. */
export class PrecioClasePuntualResponseDto {
    @ApiProperty({ example: '10.00', description: 'Precio con 2 decimales, como texto.' })
    precio!: string;
}
