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
import { CurrentUser, Roles } from '@Auth/decorators';
import { DesempenoQueryDto, DetalleIngresosQueryDto, DetalleIngresosResponseDto, RangoReporteQueryDto, ReporteDesempenoResponseDto, ReporteIngresosResponseDto, ReporteOcupacionResponseDto, ReporteRenovacionResponseDto } from '@Reportes/dto';
import { ReportesDesempenoService, ReportesService } from '@Reportes/services';
import { Rol, type User } from '@PrismaClient';

/** Reportes del Módulo 10. Solo el administrador, salvo "Mi desempeño" (H29), que también abre el entrenador. */
@ApiTags('reportes')
@ApiBearerAuth()
@Controller('reportes')
export class ReportesController {
    constructor(
        private readonly reportesService: ReportesService,
        private readonly desempenoService: ReportesDesempenoService,
    ) { }

    @Get('desempeno')
    @Roles(Rol.ADMINISTRADOR, Rol.ENTRENADOR)
    @ApiOperation({
        summary: 'Desempeño por entrenador: clases impartidas, ocupación, sesiones realizadas y calificación (H29)',
        description: 'Un entrenador solo recibe sus propias métricas: se ignora entrenadorId.',
    })
    @ApiOkResponse({ type: ReporteDesempenoResponseDto })
    @ApiBadRequestResponse({ description: 'Fechas inválidas, inicio posterior al fin, rango superior a 12 meses o entrenador inválido.' })
    @ApiUnauthorizedResponse({ description: 'Sin sesión.' })
    @ApiForbiddenResponse({ description: 'El usuario no es administrador ni entrenador.' })
    desempeno(@CurrentUser() user: User, @Query() query: DesempenoQueryDto): Promise<ReporteDesempenoResponseDto> {
        return this.desempenoService.desempeno(user, query);
    }

    @Get('renovacion')
    @Roles(Rol.ADMINISTRADOR)
    @ApiOperation({ summary: 'Tasas de renovación y cancelación de membresías Mensual/Set por vencimiento (H28)' })
    @ApiOkResponse({ type: ReporteRenovacionResponseDto })
    @ApiBadRequestResponse({ description: 'Fechas inválidas, inicio posterior al fin o rango superior a 12 meses.' })
    @ApiUnauthorizedResponse({ description: 'Sin sesión o token inválido.' })
    @ApiForbiddenResponse({ description: 'El usuario no es administrador.' })
    renovacion(@Query() query: RangoReporteQueryDto): Promise<ReporteRenovacionResponseDto> {
        return this.reportesService.renovacion(query.desde, query.hasta);
    }

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
