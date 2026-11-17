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
import { MiReservaResponseDto, MisReservasQueryDto } from '@Reservas/dto';
import { ReservasService } from '@Reservas/services';
import { Rol, type User } from '@PrismaClient';

/** Reservas de clases grupales (H5). Solo para el rol MIEMBRO. */
@ApiTags('reservas')
@ApiBearerAuth()
@Controller('reservas')
export class ReservasController {
    constructor(private readonly reservasService: ReservasService) { }

    /** El miembro sale del token; no se acepta un id de miembro. */
    @Get('mias')
    @Roles(Rol.MIEMBRO)
    @ApiOperation({ summary: 'Reservas del miembro autenticado: próximas (por defecto) o pasadas' })
    @ApiOkResponse({ type: MiReservaResponseDto, isArray: true })
    @ApiBadRequestResponse({ description: 'El estado no es proximas ni pasadas.' })
    @ApiUnauthorizedResponse({ description: 'Sin sesión.' })
    @ApiForbiddenResponse({ description: 'El usuario no es miembro.' })
    listarMias(
        @CurrentUser() user: User,
        @Query() query: MisReservasQueryDto,
    ): Promise<MiReservaResponseDto[]> {
        return this.reservasService.listarMias(user.id, query.estado);
    }
}
