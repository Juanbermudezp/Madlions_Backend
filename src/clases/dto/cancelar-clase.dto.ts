import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';
import { EstadoClase } from '@PrismaClient';

export class CancelarClaseDto {
    @ApiProperty({ minLength: 10, maxLength: 250, example: 'El entrenador está incapacitado' })
    @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
    @IsString()
    @Length(10, 250, { message: 'El motivo debe tener de 10 a 250 caracteres.' })
    motivo!: string;
}

export class ClaseCanceladaResponseDto {
    @ApiProperty({ format: 'uuid' }) id!: string;
    @ApiProperty({ enum: [EstadoClase.CANCELADA_GIMNASIO] }) estado!: typeof EstadoClase.CANCELADA_GIMNASIO;
    @ApiProperty({ example: 3, description: 'Reservas CONFIRMADA que cambió esta transacción.' }) reservasCanceladas!: number;
}
