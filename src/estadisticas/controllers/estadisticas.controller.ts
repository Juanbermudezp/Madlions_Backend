import { Controller, Get, Query } from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiForbiddenResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '@Auth/decorators';
import { RangoReporteQueryDto } from '@Reportes/dto';
import { EstadisticasService } from '@Estadisticas/services';
import { CalificacionesResponseDto } from '@Estadisticas/dto';
import { Rol } from '@PrismaClient';

// Estadísticas de calificaciones (H21). Solo el administrador.
@ApiTags('estadisticas')
@ApiBearerAuth()
@Controller('estadisticas')
export class EstadisticasController {
    constructor(private readonly estadisticasService: EstadisticasService) { }

    @Get('calificaciones')
    @Roles(Rol.ADMINISTRADOR)
    @ApiOperation({
        summary: 'Promedio de calificación por entrenador, por tipo de clase y de las instalaciones',
        description:
            'Sin rango, los últimos 30 días. El promedio llega en null cuando el aspecto tiene ' +
            'menos de 3 reseñas en el rango.',
    })
    @ApiOkResponse({ type: CalificacionesResponseDto })
    @ApiBadRequestResponse({
        description:
            'La fecha de inicio no puede ser posterior a la de fin · El rango máximo es de 12 meses · formato inválido',
    })
    @ApiUnauthorizedResponse({ description: 'Sin sesión.' })
    @ApiForbiddenResponse({ description: 'El usuario no es administrador.' })
    calificaciones(@Query() query: RangoReporteQueryDto): Promise<CalificacionesResponseDto> {
        return this.estadisticasService.calificaciones(query.desde, query.hasta);
    }
}
