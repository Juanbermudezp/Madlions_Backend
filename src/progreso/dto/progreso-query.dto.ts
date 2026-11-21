import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TipoProgreso } from '@PrismaClient';

export class ProgresoQueryDto {
  @ApiPropertyOptional({ enum: TipoProgreso })
  @IsOptional()
  @IsEnum(TipoProgreso)
  tipo?: TipoProgreso;

  @ApiPropertyOptional({ example: '2026-01-01', format: 'date' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  desde?: string;

  @ApiPropertyOptional({ example: '2026-11-07', format: 'date' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  hasta?: string;
}
