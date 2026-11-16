import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiForbiddenResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { Roles } from '@Auth/decorators';
import { EntrenadoresService } from '@Entrenadores/services';
import {
    BloquesEntrenadorResponseDto,
    EntrenadorResumenDto,
} from '@Entrenadores/dto';
import { Rol } from '@PrismaClient';

/**
 * Consulta de entrenadores para "Agendar sesión" (H9). Solo MIEMBRO:
 * entrenador, recepción y administrador reciben 403.
 */
@ApiTags('entrenadores')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'El usuario no es miembro.' })
@Roles(Rol.MIEMBRO)
@Controller('entrenadores')
export class EntrenadoresController {
    constructor(private readonly entrenadoresService: EntrenadoresService) { }

    @Get()
    @ApiOperation({ summary: 'Entrenadores activos' })
    @ApiOkResponse({ type: EntrenadorResumenDto, isArray: true })
    listar(): Promise<EntrenadorResumenDto[]> {
        return this.entrenadoresService.listar();
    }

    @Get(':id/bloques')
    @ApiOperation({
        summary: 'Bloques disponibles del entrenador (desde ahora + 2 h hasta 14 días)',
    })
    @ApiOkResponse({ type: BloquesEntrenadorResponseDto })
    @ApiNotFoundResponse({ description: 'El entrenador no existe.' })
    listarBloques(
        @Param('id', ParseUUIDPipe) id: string,
    ): Promise<BloquesEntrenadorResponseDto> {
        return this.entrenadoresService.listarBloquesDisponibles(id);
    }
}