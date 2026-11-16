import { Controller, Get, Query } from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiForbiddenResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import { MiembrosService } from '@Miembros/services';
import { BuscarMiembrosQueryDto, MiembroBusquedaResponseDto } from '@Miembros/dto';
import { Rol, type User } from '@PrismaClient';

/** Miembros del gimnasio (BE-2.2). El rol MIEMBRO recibe 403. */
@ApiTags('miembros')
@ApiBearerAuth()
@Controller('miembros')
export class MiembrosController {
    constructor(private readonly miembrosService: MiembrosService) { }

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
