import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    ParseUUIDPipe,
    Post,
} from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiConflictResponse,
    ApiCreatedResponse,
    ApiForbiddenResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, MensajeSinPermiso, Roles } from '@Auth/decorators';
import { AccesosService } from '@Accesos/services';
import {
    AccesoDelDiaDto,
    IngresoResponseDto,
    RegistrarIngresoDto,
    SalidaResponseDto,
} from '@Accesos/dto';
import { Rol, type User } from '@PrismaClient';

/**
 * Control de ingresos y salidas (H10). Solo RECEPCION; los demás roles
 * reciben 403 "Acceso denegado". El usuario de recepción sale del token.
 * La búsqueda de miembros es GET /miembros/buscar (BE-2.1).
 */
@ApiTags('accesos')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Acceso denegado' })
@Roles(Rol.RECEPCION)
@MensajeSinPermiso('Acceso denegado')
@Controller('accesos')
export class AccesosController {
    constructor(private readonly accesosService: AccesosService) { }

    @Post('ingreso')
    @ApiOperation({ summary: 'Registra el ingreso de un miembro' })
    @ApiCreatedResponse({ type: IngresoResponseDto })
    @ApiBadRequestResponse({ description: 'El miembro no es válido.' })
    @ApiNotFoundResponse({ description: 'El miembro no existe.' })
    @ApiConflictResponse({
        description: 'El miembro ya está dentro del gimnasio · Se requiere un motivo de excepción',
    }) registrarIngreso(
        @CurrentUser() user: User,
        @Body() dto: RegistrarIngresoDto,
    ): Promise<IngresoResponseDto> {
        return this.accesosService.registrarIngreso(user.id, dto);
    }

    @Post(':id/salida')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Registra la salida de un ingreso abierto' })
    @ApiOkResponse({ type: SalidaResponseDto })
    @ApiNotFoundResponse({ description: 'El registro de acceso no existe.' })
    @ApiConflictResponse({ description: 'El miembro no tiene un ingreso abierto' })
    registrarSalida(
        @CurrentUser() user: User,
        @Param('id', ParseUUIDPipe) id: string,
    ): Promise<SalidaResponseDto> {
        return this.accesosService.registrarSalida(user.id, id);
    }

    @Get('hoy')
    @ApiOperation({ summary: 'Ingresos del día (UTC-6), el más reciente primero' })
    @ApiOkResponse({ type: AccesoDelDiaDto, isArray: true })
    listarHoy(): Promise<AccesoDelDiaDto[]> {
        return this.accesosService.listarHoy();
    }
}