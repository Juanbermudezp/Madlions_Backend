import { Controller, Get, Query } from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '@Auth/decorators';
import { MaquinasService } from '@Maquinas/services';
import { ListarMaquinasQueryDto, MaquinasResponseDto } from '@Maquinas/dto';
import { type User } from '@PrismaClient';

/**
 * Estado de las máquinas del gimnasio (H17). Lo consulta cualquier usuario
 * con sesión; el administrador y el entrenador reciben además el motivo del
 * último cambio y quién lo hizo.
 */
@ApiTags('maquinas')
@ApiBearerAuth()
@Controller('maquinas')
export class MaquinasController {
    constructor(private readonly maquinasService: MaquinasService) { }

    @Get()
    @ApiOperation({
        summary: 'Lista las máquinas con filtros y el resumen por estado',
        description:
            'Los filtros se combinan con AND. Al administrador y al entrenador cada máquina ' +
            'les llega con ultimoMotivo y ultimoCambioPor; a los miembros y a recepción, sin ' +
            'esos campos.',
    })
    @ApiOkResponse({ type: MaquinasResponseDto })
    @ApiBadRequestResponse({ description: 'Alguno de los filtros no es un valor válido.' })
    listar(
        @CurrentUser() user: User,
        @Query() query: ListarMaquinasQueryDto,
    ): Promise<MaquinasResponseDto> {
        return this.maquinasService.listar(user.rol, query);
    }
}
