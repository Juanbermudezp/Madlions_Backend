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
import { SemanaQueryDto } from '@Common/dto';
import { ClaseReservableResponseDto } from '@Reservas/dto';
import { ReservasService } from '@Reservas/services';
import { Rol, type User } from '@PrismaClient';

/**
 * GET /clases/reservables (BE-5.1). Vive en el módulo de reservas porque
 * necesita las reservas del miembro; comparte el prefijo `clases` con
 * ClasesController (H4), que no tiene un GET /clases/:id con el que choque.
 */
@ApiTags('reservas')
@ApiBearerAuth()
@Controller('clases')
export class ClasesReservablesController {
    constructor(private readonly reservasService: ReservasService) { }

    @Get('reservables')
    @Roles(Rol.MIEMBRO)
    @ApiOperation({ summary: 'Clases programadas de la semana actual o la siguiente que el miembro puede reservar' })
    @ApiOkResponse({ type: ClaseReservableResponseDto, isArray: true })
    @ApiBadRequestResponse({ description: 'La semana no es válida o no es la actual ni la siguiente.' })
    @ApiUnauthorizedResponse({ description: 'Sin sesión.' })
    @ApiForbiddenResponse({ description: 'El usuario no es miembro.' })
    listarReservables(
        @CurrentUser() user: User,
        @Query() query: SemanaQueryDto,
    ): Promise<ClaseReservableResponseDto[]> {
        return this.reservasService.listarReservables(user.id, query.semana);
    }
}
