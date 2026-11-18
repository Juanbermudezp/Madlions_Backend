import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiConflictResponse,
    ApiCreatedResponse,
    ApiForbiddenResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import {
    CrearReservaDto,
    MiReservaResponseDto,
    MisReservasQueryDto,
    ReservaCreadaResponseDto,
} from '@Reservas/dto';
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

    /** BE-5.2 · El miembro sale del token; el cuerpo solo trae la clase. */
    @Post()
    @HttpCode(HttpStatus.CREATED)
    @Roles(Rol.MIEMBRO)
    @ApiOperation({ summary: 'Reservar un cupo en una clase grupal' })
    @ApiCreatedResponse({ type: ReservaCreadaResponseDto })
    @ApiBadRequestResponse({ description: 'claseId no es un UUID.' })
    @ApiNotFoundResponse({ description: 'La clase no existe.' })
    @ApiConflictResponse({
        description:
            'La clase está llena · Ya reservaste esta clase · Tienes otra actividad en ese horario · ' +
            'Tu plan no incluye este tipo de clase · Tu membresía no cubre la fecha de esta clase · ' +
            'No te quedan clases disponibles en tu plan · La clase ya no está disponible · ' +
            'Necesitas una membresía vigente para reservar',
    })
    @ApiUnauthorizedResponse({ description: 'Sin sesión.' })
    @ApiForbiddenResponse({ description: 'El usuario no es miembro.' })
    reservar(
        @CurrentUser() user: User,
        @Body() dto: CrearReservaDto,
    ): Promise<ReservaCreadaResponseDto> {
        return this.reservasService.reservar(user.id, dto.claseId);
    }
}
