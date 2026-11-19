import { Body, Controller, Get, Post } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiBadRequestResponse,
    ApiConflictResponse,
    ApiCreatedResponse,
    ApiForbiddenResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import { SesionesService } from '@Sesiones/services';
import {
    AgendarSesionDto,
    SesionAgendadaResponseDto,
    SesionResponseDto,
} from '@Sesiones/dto';
import { Rol, type User } from '@PrismaClient';

/** Sesiones personales (H9). Solo MIEMBRO; el miembro siempre sale del token. */
@ApiTags('sesiones')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'El usuario no es miembro.' })
@Roles(Rol.MIEMBRO)
@Controller('sesiones')
export class SesionesController {
    constructor(private readonly sesionesService: SesionesService) { }

    @Post()
    @ApiOperation({ summary: 'Agenda una sesión sobre un bloque disponible' })
    @ApiCreatedResponse({ type: SesionAgendadaResponseDto })
    @ApiBadRequestResponse({ description: 'El bloque no es válido.' })
    @ApiNotFoundResponse({ description: 'El bloque no existe.' })
    @ApiConflictResponse({
        description:
            'Este horario ya no está disponible · Solo puedes agendar con al menos 2 horas de anticipación · ' +
            'Necesitas una membresía vigente para agendar · Ya tienes 5 sesiones agendadas que no han empezado · ' +
            'Ya tienes otra sesión agendada en ese horario',
    })
    agendar(
        @CurrentUser() user: User,
        @Body() dto: AgendarSesionDto,
    ): Promise<SesionAgendadaResponseDto> {
        return this.sesionesService.agendar(user.id, dto.bloqueId);
    }

    @Get('mias')
    @ApiOperation({ summary: 'Mis sesiones, con el estado de su cobro' })
    @ApiOkResponse({ type: SesionResponseDto, isArray: true })
    listarMias(@CurrentUser() user: User): Promise<SesionResponseDto[]> {
        return this.sesionesService.listarMias(user.id);
    }
}