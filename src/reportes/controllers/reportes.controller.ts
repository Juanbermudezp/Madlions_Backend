import { Controller, Get, Query } from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiForbiddenResponse,
    ApiInternalServerErrorResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '@Auth/decorators';
import { DetalleIngresosQueryDto, DetalleIngresosResponseDto, RangoReporteQueryDto, ReporteIngresosResponseDto, ReporteOcupacionResponseDto } from '@Reportes/dto';
import { ReportesService } from '@Reportes/services';
import { Rol } from '@PrismaClient';

/** Reportes del Módulo 10. Solo el administrador (H29 abrirá "Mi desempeño" al entrenador). */
@ApiTags('reportes')
@ApiBearerAuth()
@Controller('reportes')
export class ReportesController {
    constructor(private readonly reportesService: ReportesService) { }

    @Get('ingresos')
    @Roles(Rol.ADMINISTRADOR)
    @ApiOperation({ summary: 'Ingresos pagados, IVA y comparación con el período anterior (H27)' })
    @ApiOkResponse({ type: ReporteIngresosResponseDto })
    @ApiBadRequestResponse({ description: 'Fechas inválidas, inicio posterior al fin o rango superior a 12 meses.' })
    @ApiUnauthorizedResponse({ description: 'Sin sesión.' })
    @ApiForbiddenResponse({ description: 'El usuario no es administrador.' })
    ingresos(@Query() query: RangoReporteQueryDto): Promise<ReporteIngresosResponseDto> {
        return this.reportesService.ingresos(query.desde, query.hasta);
    }

    @Get('ingresos/detalle')
    @Roles(Rol.ADMINISTRADOR)
    @ApiOperation({ summary: 'Pagos de un concepto, paginados de 20 en 20 (H27)' })
    @ApiOkResponse({ type: DetalleIngresosResponseDto })
    @ApiBadRequestResponse({ description: 'Concepto obligatorio, página entera positiva o rango de fechas inválido.' })
    @ApiUnauthorizedResponse({ description: 'Sin sesión.' })
    @ApiForbiddenResponse({ description: 'El usuario no es administrador.' })
    @ApiInternalServerErrorResponse({ description: 'Un cobro pagado no permite identificar su intento aprobado de forma consistente.' })
    detalleIngresos(@Query() query: DetalleIngresosQueryDto): Promise<DetalleIngresosResponseDto> {
        return this.reportesService.detalleIngresos(query);
    }

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
