import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Matches } from 'class-validator';


export class CreateBloqueDto {
    @ApiProperty({ example: '2026-11-10', description: 'Fecha del bloque (AAAA-MM-DD), hora de El Salvador.' })
    @IsString()
    @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe tener el formato AAAA-MM-DD.' })
    fecha!: string;

    @ApiProperty({ example: '07:30', description: 'Hora de inicio (HH:MM), de 05:00 a 21:00 en múltiplos de 15 minutos.' })
    @IsString()
    @Matches(/^\d{2}:\d{2}$/, { message: 'La hora de inicio debe tener el formato HH:MM.' })
    horaInicio!: string;

    @ApiProperty({ enum: [45, 60, 90], example: 60 })
    @IsInt({ message: 'La duración debe ser un número entero de minutos.' })
    duracionMin!: number;
}