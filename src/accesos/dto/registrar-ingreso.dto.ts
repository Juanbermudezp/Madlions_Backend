import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** Cuerpo de POST /accesos/ingreso. El usuario de recepción sale del token. */
export class RegistrarIngresoDto {
    @ApiProperty({ format: 'uuid', description: 'Id de la ficha del miembro (resultado de GET /miembros/buscar).' })
    @IsUUID('all', { message: 'El miembro no es válido.' })
    miembroId!: string;

    @ApiPropertyOptional({
        maxLength: 250,
        description: 'Motivo para dejar pasar a un miembro sin membresía vigente. La regla está en BE-11.1.',
    })
    @IsOptional()
    @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
    @IsString()
    @MaxLength(250, { message: 'El motivo no puede superar los 250 caracteres.' })
    motivoExcepcion?: string;
}