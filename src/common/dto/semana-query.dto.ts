import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

/** Query `?semana=AAAA-MM-DD` de los calendarios semanales. */
export class SemanaQueryDto {
  @ApiPropertyOptional({
    example: '2026-11-09',
    description:
      'Cualquier día de la semana a consultar (AAAA-MM-DD). Por defecto, la semana actual.',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La semana debe tener el formato AAAA-MM-DD.',
  })
  semana?: string;
}