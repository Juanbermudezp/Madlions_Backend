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
import { RangoReporteQueryDto, ReporteOcupacionResponseDto } from '@Reportes/dto';
import { ReportesService } from '@Reportes/services';
import { Rol } from '@PrismaClient';

/** Reportes del Módulo 10. Solo el administrador (H29 abrirá "Mi desempeño" al entrenador). */
@ApiTags('reportes')
@ApiBearerAuth()
@Controller('reportes')
export class ReportesController {
    constructor(private readonly reportesService: ReportesService) { }

    @Get('ocupacion')
    @Roles(Rol.ADMINISTRADOR)
    @ApiOperation({ summary: 'Ocupación de las clases impartidas por tipo de clase y entrenador (H26)' })
    @ApiOkResponse({ type: ReporteOcupacionResponseDto })
    @ApiBadRequestResponse({
        description: 'La fecha de inicio no puede ser posterior a la de fin · El rango máximo es de 12 meses · formato inválido',
    })
    @ApiUnauthorizedResponse({ description: 'Sin sesión.' })
    @ApiForbiddenResponse({ description: 'El usuario no es administrador.' })
    ocupacion(@Query() query: RangoReporteQueryDto): Promise<ReporteOcupacionResponseDto> {
        return this.reportesService.ocupacion(query.desde, query.hasta);
    }
}
