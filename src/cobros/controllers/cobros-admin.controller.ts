import { Controller, Get, Query } from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiForbiddenResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { MensajeSinPermiso, Roles } from '@Auth/decorators';
import { CobrosAdminService } from '@Cobros/services';
import { CobrosAdminQueryDto, CobrosAdminResponseDto } from '@Cobros/dto';
import { Rol } from '@PrismaClient';

/**
 * Consulta administrativa de cobros (H13). Solo ADMINISTRADOR; los demás
 * roles reciben 403 "Acceso denegado". Va en su propio controlador para no
 * mezclarse con los endpoints del miembro (CobrosController, H12).
 */
@ApiTags('cobros')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Sin sesión.' })
@ApiForbiddenResponse({ description: 'Acceso denegado' })
@Roles(Rol.ADMINISTRADOR)
@MensajeSinPermiso('Acceso denegado')
@Controller('cobros')
export class CobrosAdminController {
    constructor(private readonly cobrosAdminService: CobrosAdminService) { }

    @Get()
    @ApiOperation({ summary: 'Cobros pendientes o pagados con búsqueda, filtros y paginación (20 por página)' })
    @ApiOkResponse({ type: CobrosAdminResponseDto })
    @ApiBadRequestResponse({ description: 'Estado, concepto, búsqueda o página inválidos.' })
    listar(@Query() query: CobrosAdminQueryDto): Promise<CobrosAdminResponseDto> {
        return this.cobrosAdminService.listar(query);
    }
}