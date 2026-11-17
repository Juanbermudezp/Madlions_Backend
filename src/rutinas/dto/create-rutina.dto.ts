import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { UpdateRutinaDto } from './update-rutina.dto.js';

export class CreateRutinaDto extends UpdateRutinaDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  miembroId!: string;
}
