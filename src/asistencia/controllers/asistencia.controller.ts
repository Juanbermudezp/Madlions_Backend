import { Body, Controller, Get, Put } from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiConflictResponse,
    ApiForbiddenResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import { AsistenciaService } from '@Asistencia/services';
import {
    ActividadPendienteDto,
    MarcaGuardadaDto,
    MarcarAsistenciaDto,
} from '@Asistencia/dto';
import { Rol, type User } from '@PrismaClient';

// Registro de asistencia a clases y sesiones (H19). Solo el entrenador.
@ApiTags('asistencia')
@ApiBearerAuth()
@Roles(Rol.ENTRENADOR)
@Controller('asistencia')
export class AsistenciaController {
    constructor(private readonly asistenciaService: AsistenciaService) { }

    @Get('pendientes')
    @ApiOperation({
        summary: 'Clases y sesiones del entrenador con asistencia por registrar',
        description:
            'Las que ya empezaron y terminaron hace 24 horas o menos, con sus miembros. ' +
            'Las reservas canceladas no aparecen.',
    })
    @ApiOkResponse({ type: ActividadPendienteDto, isArray: true })
    @ApiForbiddenResponse({ description: 'El usuario no es entrenador.' })
    pendientes(@CurrentUser() user: User): Promise<ActividadPendienteDto[]> {
        return this.asistenciaService.pendientes(user.id);
    }

    @Put()
    @ApiOperation({
        summary: 'Marca la asistencia de uno o varios miembros',
        description:
            'Guarda la marca con el entrenador y la fecha y hora. Si una marca no es ' +
            'válida no se guarda ninguna.',
    })
    @ApiOkResponse({ type: MarcaGuardadaDto, isArray: true })
    @ApiBadRequestResponse({ description: 'Datos inválidos o el mismo registro repetido.' })
    @ApiForbiddenResponse({
        description: 'El usuario no es entrenador, o la actividad es de otro entrenador.',
    })
    @ApiNotFoundResponse({ description: 'El registro no existe.' })
    @ApiConflictResponse({ description: 'Fuera de la ventana de registro, o reserva cancelada.' })
    marcar(
        @CurrentUser() user: User,
        @Body() dto: MarcarAsistenciaDto,
    ): Promise<MarcaGuardadaDto[]> {
        return this.asistenciaService.marcar(user.id, dto);
    }
}
