import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    ParseUUIDPipe,
    Post,
    Query,
} from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiConflictResponse,
    ApiCreatedResponse,
    ApiForbiddenResponse,
    ApiNoContentResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import { BloquesService } from '@Bloques/services';
import { BloqueResponseDto, CreateBloqueDto } from '@Bloques/dto';
import { SemanaQueryDto } from '@Common/dto';
import { Rol, type User } from '@PrismaClient';

/**
 * Bloques de disponibilidad (H8). Todo el controlador es solo para
 * ENTRENADOR: miembro, recepción y administrador reciben 403.
 * El entrenador siempre sale del token.
 */
@ApiTags('bloques')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'El usuario no es entrenador.' })
@Roles(Rol.ENTRENADOR)
@Controller('bloques')
export class BloquesController {
    constructor(private readonly bloquesService: BloquesService) { }

    @Get('mios')
    @ApiOperation({ summary: 'Bloques del entrenador en una semana' })
    @ApiOkResponse({ type: BloqueResponseDto, isArray: true })
    listarMios(
        @CurrentUser() user: User,
        @Query() query: SemanaQueryDto,
    ): Promise<BloqueResponseDto[]> {
        return this.bloquesService.listarSemana(user.id, query.semana);
    }

    @Post()
    @ApiOperation({ summary: 'Registra un bloque disponible' })
    @ApiCreatedResponse({ type: BloqueResponseDto })
    @ApiBadRequestResponse({ description: 'Duración, fecha u hora inválidas.' })
    @ApiConflictResponse({ description: 'Ya tienes una actividad en ese horario' })
    crear(
        @CurrentUser() user: User,
        @Body() dto: CreateBloqueDto,
    ): Promise<BloqueResponseDto> {
        return this.bloquesService.crear(user.id, dto);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Elimina un bloque disponible propio' })
    @ApiNoContentResponse({ description: 'Bloque eliminado.' })
    @ApiNotFoundResponse({ description: 'El bloque no existe.' })
    @ApiConflictResponse({ description: 'No puedes eliminar un bloque con una sesión agendada' })
    async eliminar(
        @CurrentUser() user: User,
        @Param('id', ParseUUIDPipe) id: string,
    ): Promise<void> {
        await this.bloquesService.eliminar(user.id, id);
    }
}