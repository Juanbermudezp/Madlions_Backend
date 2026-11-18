import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional } from 'class-validator';
import { EstadoMaquina, TipoMaquina, ZonaMaquina } from '@PrismaClient';

export const ESTADO_MAQUINA_INVALIDO =
    'El estado debe ser OPERATIVA, EN_MANTENIMIENTO o FUERA_DE_SERVICIO.';
export const TIPO_MAQUINA_INVALIDO =
    'El tipo debe ser CARDIO, FUERZA, PESO_LIBRE o FUNCIONAL.';
export const ZONA_MAQUINA_INVALIDA =
    'La zona debe ser PISO_1, PISO_2 o AREA_FUNCIONAL.';

const vacioEsSinFiltro = ({ value }: { value: unknown }) =>
    value === '' ? undefined : value;

export class ListarMaquinasQueryDto {
    @ApiPropertyOptional({ enum: EstadoMaquina, example: EstadoMaquina.EN_MANTENIMIENTO })
    @Transform(vacioEsSinFiltro)
    @IsOptional()
    @IsEnum(EstadoMaquina, { message: ESTADO_MAQUINA_INVALIDO })
    estado?: EstadoMaquina;

    @ApiPropertyOptional({ enum: TipoMaquina, example: TipoMaquina.CARDIO })
    @Transform(vacioEsSinFiltro)
    @IsOptional()
    @IsEnum(TipoMaquina, { message: TIPO_MAQUINA_INVALIDO })
    tipo?: TipoMaquina;

    @ApiPropertyOptional({ enum: ZonaMaquina, example: ZonaMaquina.PISO_1 })
    @Transform(vacioEsSinFiltro)
    @IsOptional()
    @IsEnum(ZonaMaquina, { message: ZONA_MAQUINA_INVALIDA })
    zona?: ZonaMaquina;
}
