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
import { CurrentUser, Roles } from '@Auth/decorators';
import { CobrosService } from '@Cobros/services';
import { CobroResponseDto, CobrosQueryDto } from '@Cobros/dto';
import { Rol, type User } from '@PrismaClient';

/** Cobros del miembro (H12). Solo MIEMBRO; los demás roles reciben 403. */
@ApiTags('cobros')
@ApiBearerAuth()
@Controller('cobros')
export class CobrosController {
    constructor(private readonly cobrosService: CobrosService) { }

    @Get('mios')
    @Roles(Rol.MIEMBRO)
    @ApiOperation({ summary: 'Cobros del miembro autenticado (el miembro sale del token)' })
    @ApiOkResponse({ type: CobroResponseDto, isArray: true })
    @ApiBadRequestResponse({ description: 'Estado inválido.' })
    @ApiUnauthorizedResponse({ description: 'Sin sesión.' })
    @ApiForbiddenResponse({ description: 'El usuario no es miembro.' })
    listarMios(@Query() query: CobrosQueryDto, @CurrentUser() user: User): Promise<CobroResponseDto[]> {
        return this.cobrosService.listarMios(user.id, query.estado);
    }
}
