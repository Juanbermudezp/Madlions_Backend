import { Body, Controller, Get, Put } from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiForbiddenResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { Roles } from '@Auth/decorators';
import { ConfiguracionService } from '@Configuracion/services';
import {
    PrecioClasePuntualResponseDto,
    UpdatePrecioClasePuntualDto,
} from '@Configuracion/dto';
import { Rol } from '@PrismaClient';

/**
 * Precio de la clase puntual (H1, BE-1.2). Cualquier usuario con sesión lo
 * consulta; solo el administrador lo cambia: los demás roles reciben 403.
 */
@ApiTags('configuracion')
@ApiBearerAuth()
@Controller('configuracion')
export class ConfiguracionController {
    constructor(private readonly configuracionService: ConfiguracionService) { }

    @Get('precio-clase-puntual')
    @ApiOperation({ summary: 'Consulta el precio actual de la clase puntual' })
    @ApiOkResponse({ type: PrecioClasePuntualResponseDto })
    consultarPrecioClasePuntual(): Promise<PrecioClasePuntualResponseDto> {
        return this.configuracionService.consultarPrecioClasePuntual();
    }

    @Put('precio-clase-puntual')
    @Roles(Rol.ADMINISTRADOR)
    @ApiOperation({ summary: 'Actualiza el precio de la clase puntual' })
    @ApiOkResponse({ type: PrecioClasePuntualResponseDto })
    @ApiBadRequestResponse({ description: 'Precio menor o igual a 0 o con más de 2 decimales.' })
    @ApiForbiddenResponse({ description: 'El usuario no es administrador.' })
    actualizarPrecioClasePuntual(
        @Body() dto: UpdatePrecioClasePuntualDto,
    ): Promise<PrecioClasePuntualResponseDto> {
        return this.configuracionService.actualizarPrecioClasePuntual(dto);
    }
}
