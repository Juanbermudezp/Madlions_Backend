import { ApiProperty } from '@nestjs/swagger';

export class MembresiaNoRenovadaDto {
    @ApiProperty({ example: 'Sofía Castillo' }) nombre!: string;
    @ApiProperty({ example: 'MBR-000045' }) codigo!: string;
    @ApiProperty({ example: 'Set de clases mensual', description: 'Nombre histórico del plan en la membresía.' }) plan!: string;
    @ApiProperty({ format: 'date', example: '2026-10-25' }) fechaVencimiento!: string;
}

export class ReporteRenovacionResponseDto {
    @ApiProperty({ example: 4 }) renovadas!: number;
    @ApiProperty({ example: 3, description: 'Clasificación analítica; no cambia el estado de la membresía.' }) canceladas!: number;
    @ApiProperty({ example: 1, description: 'Sin renovación válida y hoy <= vencimiento + 7 días; fuera del denominador.' }) enPeriodo!: number;
    @ApiProperty({ type: Number, nullable: true, example: 57.1, description: 'HALF_UP a un decimal. null sin renovadas ni canceladas.' }) tasaRenovacion!: number | null;
    @ApiProperty({ type: Number, nullable: true, example: 42.9, description: 'Complemento de tasaRenovacion hasta 100.0; null sin denominador.' }) tasaCancelacion!: number | null;
    @ApiProperty({ type: [MembresiaNoRenovadaDto], description: 'Solo canceladas; vencimiento DESC e ID ASC para desempate.' }) noRenovaron!: MembresiaNoRenovadaDto[];
}
