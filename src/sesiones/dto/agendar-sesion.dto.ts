import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/** Cuerpo de POST /sesiones. El miembro sale del token, nunca del cuerpo. */
export class AgendarSesionDto {
    @ApiProperty({ format: 'uuid' })
    @IsUUID('all', { message: 'El bloque no es válido.' })
    bloqueId!: string;
}