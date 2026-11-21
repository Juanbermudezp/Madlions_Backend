import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiForbiddenResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
    ApiParam,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import { MiembrosService } from '@Miembros/services';
import { BuscarMiembrosQueryDto, MiembroBusquedaResponseDto } from '@Miembros/dto';
import { Rol, type User } from '@PrismaClient';
import { MiembroProgresoService } from '../services/miembro-progreso.service.js';
import { ProgresoQueryDto, ProgresoResponseDto } from '../../progreso/dto/index.js';

/** Miembros del gimnasio (BE-2.2). El rol MIEMBRO recibe 403. */
@ApiTags('miembros')
@ApiBearerAuth()
@Controller('miembros')
export class MiembrosController {
    constructor(
        private readonly miembrosService: MiembrosService,
        private readonly miembroProgresoService: MiembroProgresoService,
    ) { }

    @Get(':id/progreso')
    @Roles(Rol.ENTRENADOR)
    @ApiOperation({ summary: 'Consulta el progreso de un miembro con al menos una rutina propia asignada (S14)' })
    @ApiParam({ name: 'id', format: 'uuid', description: 'UUID de la ficha del miembro, no del usuario.' })
    @ApiOkResponse({ type: ProgresoResponseDto, description: 'Misma estructura y filtros de H16; series vacías si no hay registros.' })
    @ApiBadRequestResponse({ description: 'UUID, tipo o rango de fechas inválido.' })
    @ApiUnauthorizedResponse({ description: 'Sin autenticación válida.' })
    @ApiForbiddenResponse({ description: 'Rol no permitido o ninguna rutina propia asignada al miembro; incluye miembro inexistente.' })
    consultarProgreso(
        @Param('id', ParseUUIDPipe) miembroId: string,
        @Query() query: ProgresoQueryDto,
        @CurrentUser() user: User,
    ): Promise<ProgresoResponseDto> {
        return this.miembroProgresoService.consultar(user.id, miembroId, query);
    }

    @Get('buscar')
    @Roles(Rol.RECEPCION, Rol.ADMINISTRADOR, Rol.ENTRENADOR)
    @ApiOperation({ summary: 'Busca miembros por nombre, documento o código (máximo 20)' })
    @ApiOkResponse({ type: MiembroBusquedaResponseDto, isArray: true })
    @ApiBadRequestResponse({ description: 'La búsqueda debe tener entre 2 y 50 caracteres.' })
    @ApiForbiddenResponse({ description: 'El usuario es MIEMBRO.' })
    buscar(
        @Query() query: BuscarMiembrosQueryDto,
        @CurrentUser() user: User,
    ): Promise<MiembroBusquedaResponseDto[]> {
        return this.miembrosService.buscar(query.q, user.rol);
    }
}
