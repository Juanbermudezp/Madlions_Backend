import {
    Body,
    Controller,
    Get,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Query,
} from '@nestjs/common';
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
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import { ClasesService } from '@Clases/services';
import {
    ClaseAgendaResponseDto,
    ClaseResponseDto,
    CreateClaseDto,
    EntrenadorResumenDto,
    UpdateClaseDto,
} from '@Clases/dto';
import { SemanaQueryDto } from '@Common/dto';
import { Rol, type User } from '@PrismaClient';

/**
 * Clases grupales. Los permisos van por endpoint:
 * - GET /clases (agenda semanal): todos los roles.
 * - GET /clases/mias: solo ENTRENADOR (H8).
 * - GET /clases/entrenadores: solo ADMINISTRADOR (formulario de H4).
 * - POST y PATCH: solo ADMINISTRADOR (H4).
 */
@ApiTags('clases')
@ApiBearerAuth()
@Controller('clases')
export class ClasesController {
    constructor(private readonly clasesService: ClasesService) { }

    @Get()
    @ApiOperation({ summary: 'Agenda semanal de clases (lunes a domingo)' })
    @ApiOkResponse({ type: ClaseAgendaResponseDto, isArray: true })
    listarAgenda(@Query() query: SemanaQueryDto): Promise<ClaseAgendaResponseDto[]> {
        return this.clasesService.listarAgenda(query.semana);
    }

    /** El entrenador sale del token; no se acepta un id de entrenador por query. */
    @Get('mias')
    @Roles(Rol.ENTRENADOR)
    @ApiOperation({ summary: 'Clases programadas del entrenador en una semana' })
    @ApiOkResponse({ type: ClaseResponseDto, isArray: true })
    @ApiForbiddenResponse({ description: 'El usuario no es entrenador.' })
    listarMias(
        @CurrentUser() user: User,
        @Query() query: SemanaQueryDto,
    ): Promise<ClaseResponseDto[]> {
        return this.clasesService.listarSemana(user.id, query.semana);
    }

    @Get('entrenadores')
    @Roles(Rol.ADMINISTRADOR)
    @ApiOperation({ summary: 'Entrenadores activos que pueden impartir una clase' })
    @ApiOkResponse({ type: EntrenadorResumenDto, isArray: true })
    @ApiForbiddenResponse({ description: 'El usuario no es administrador.' })
    listarEntrenadores(): Promise<EntrenadorResumenDto[]> {
        return this.clasesService.listarEntrenadores();
    }

    @Post()
    @Roles(Rol.ADMINISTRADOR)
    @ApiOperation({ summary: 'Programa una clase grupal' })
    @ApiCreatedResponse({ type: ClaseAgendaResponseDto })
    @ApiBadRequestResponse({ description: 'Datos inválidos, horario pasado, tipo o entrenador inexistente.' })
    @ApiForbiddenResponse({ description: 'El usuario no es administrador.' })
    @ApiConflictResponse({ description: 'El entrenador ya tiene una actividad en ese horario' })
    crear(@Body() dto: CreateClaseDto): Promise<ClaseAgendaResponseDto> {
        return this.clasesService.crear(dto);
    }

    @Patch(':id')
    @Roles(Rol.ADMINISTRADOR)
    @ApiOperation({ summary: 'Modifica una clase programada que aún no empieza' })
    @ApiOkResponse({ type: ClaseAgendaResponseDto })
    @ApiBadRequestResponse({ description: 'Datos inválidos, horario pasado, tipo o entrenador inexistente.' })
    @ApiForbiddenResponse({ description: 'El usuario no es administrador.' })
    @ApiNotFoundResponse({ description: 'La clase no existe.' })
    @ApiConflictResponse({
        description: 'Traslape del entrenador, cupo menor que las reservas, clase cancelada o ya iniciada.',
    })
    actualizar(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateClaseDto,
    ): Promise<ClaseAgendaResponseDto> {
        return this.clasesService.actualizar(id, dto);
    }
}
