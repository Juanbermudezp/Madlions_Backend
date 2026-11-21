import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, ValidateIf } from 'class-validator';

export class RutinasQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsUUID()
  miembroId?: string;
}
