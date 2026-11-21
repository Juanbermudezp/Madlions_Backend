import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
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
    ReservaCanceladaResponseDto,
    ReservaCreadaResponseDto,
} from '@Reservas/dto';
import { ReservasService } from '@Reservas/services';
import { Rol, type User } from '@PrismaClient';

/** Reservas de clases grupales (H5) y su cancelación (H6). Solo para el rol MIEMBRO. */
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

    /** BE-6.1 · Sin cuerpo: la reserva sale de la URL y el dueño se compara con el token. */
    @Post(':id/cancelar')
    @HttpCode(HttpStatus.OK)
    @Roles(Rol.MIEMBRO)
    @ApiOperation({ summary: 'Cancelar una reserva propia hasta 2 horas antes del inicio de la clase' })
    @ApiOkResponse({ type: ReservaCanceladaResponseDto })
    @ApiBadRequestResponse({ description: 'El id no es un UUID.' })
    @ApiNotFoundResponse({ description: 'La reserva no existe.' })
    @ApiConflictResponse({
        description:
            'Esta reserva ya fue cancelada · Solo puedes cancelar hasta 2 horas antes del inicio de la clase',
    })
    @ApiUnauthorizedResponse({ description: 'Sin sesión.' })
    @ApiForbiddenResponse({ description: 'La reserva es de otro miembro, o el usuario no es miembro.' })
    cancelar(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: User,
    ): Promise<ReservaCanceladaResponseDto> {
        return this.reservasService.cancelar(user.id, id);
    }
}
