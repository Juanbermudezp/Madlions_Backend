import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/** Cuerpo de POST /reservas (BE-5.2). El miembro sale del token. */
export class CrearReservaDto {
    @ApiProperty({ format: 'uuid' })
    @IsUUID('all', { message: 'La clase no es válida.' })
    claseId!: string;
}
