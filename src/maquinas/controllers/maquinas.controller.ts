import {
    Body,
    Controller,
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
    ApiForbiddenResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import { MaquinasService } from '@Maquinas/services';
import {
    CambiarEstadoMaquinaDto,
    HistorialMaquinaResponseDto,
    ListarMaquinasQueryDto,
    MaquinaInternaResponseDto,
    MaquinasResponseDto,
} from '@Maquinas/dto';
import { Rol, type User } from '@PrismaClient';

// Estado de las máquinas del gimnasio (H17) y su mantenimiento (H18).
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

    @Post(':id/estado')
    @Roles(Rol.ADMINISTRADOR, Rol.ENTRENADOR)
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Cambia el estado de una máquina y lo registra en el historial',
        description:
            'El entrenador también puede, porque es quien detecta las fallas en el piso ' +
            '(supuesto S13). Al volver a OPERATIVA se borra la fecha estimada de retorno.',
    })
    @ApiOkResponse({ type: MaquinaInternaResponseDto })
    @ApiBadRequestResponse({ description: 'Motivo o fecha estimada inválidos.' })
    @ApiForbiddenResponse({ description: 'El usuario no es administrador ni entrenador.' })
    @ApiNotFoundResponse({ description: 'La máquina no existe.' })
    @ApiConflictResponse({ description: 'La máquina ya está en ese estado.' })
    cambiarEstado(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: User,
        @Body() dto: CambiarEstadoMaquinaDto,
    ): Promise<MaquinaInternaResponseDto> {
        return this.maquinasService.cambiarEstado(id, user.id, dto);
    }

    @Get(':id/historial')
    @Roles(Rol.ADMINISTRADOR, Rol.ENTRENADOR)
    @ApiOperation({
        summary: 'Historial de cambios de estado de una máquina, del más reciente al más antiguo',
    })
    @ApiOkResponse({ type: HistorialMaquinaResponseDto, isArray: true })
    @ApiForbiddenResponse({ description: 'El usuario no es administrador ni entrenador.' })
    @ApiNotFoundResponse({ description: 'La máquina no existe.' })
    historial(
        @Param('id', ParseUUIDPipe) id: string,
    ): Promise<HistorialMaquinaResponseDto[]> {
        return this.maquinasService.historial(id);
    }
}
