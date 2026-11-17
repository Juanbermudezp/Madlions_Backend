import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiConflictResponse,
    ApiCreatedResponse,
    ApiForbiddenResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiUnauthorizedResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import { MembresiasService, RegistroMembresiaService } from '@Membresias/services';
import {
    EstadoMembresiaResponseDto,
    MembresiaDetalleResponseDto,
    MembresiaRegistradaResponseDto,
    OperacionMembresiaDto,
    ResumenMembresiaResponseDto,
} from '@Membresias/dto';
import { Rol, type User } from '@PrismaClient';

/**
 * Membresías. Compra o renovación (H2, BE-2.3): solo recepción registra.
 * Consulta de la membresía propia (H3): solo el miembro, siempre la suya.
 * Los demás roles reciben 403.
 */
@ApiTags('membresias')
@ApiBearerAuth()
@Controller('membresias')
export class MembresiasController {
    constructor(
        private readonly registroService: RegistroMembresiaService,
        private readonly membresiasService: MembresiasService,
    ) { }

    @Get('resumen')
    @Roles(Rol.RECEPCION)
    @ApiOperation({ summary: 'Resumen de la compra o renovación, sin guardar nada' })
    @ApiOkResponse({ type: ResumenMembresiaResponseDto })
    @ApiBadRequestResponse({ description: 'Datos inválidos o fecha de inicio fuera de rango.' })
    @ApiForbiddenResponse({ description: 'El usuario no es recepción.' })
    @ApiNotFoundResponse({ description: 'El miembro o el plan no existe.' })
    @ApiConflictResponse({ description: 'Plan inactivo u operación pendiente de pago.' })
    resumen(@Query() query: OperacionMembresiaDto): Promise<ResumenMembresiaResponseDto> {
        return this.registroService.resumen(query);
    }

    // `mia` va antes de `:id`, y `:id` exige un UUID, para que nunca se confundan.
    @Get('mia')
    @Roles(Rol.MIEMBRO)
    @ApiOperation({ summary: 'Estado de la membresía del miembro autenticado (el miembro sale del token)' })
    @ApiOkResponse({ type: EstadoMembresiaResponseDto })
    @ApiUnauthorizedResponse({ description: 'Sin sesión.' })
    @ApiForbiddenResponse({ description: 'El usuario no es miembro.' })
    obtenerMia(@CurrentUser() user: User): Promise<EstadoMembresiaResponseDto> {
        return this.membresiasService.obtenerMiEstado(user.id);
    }

    @Get(':id')
    @Roles(Rol.MIEMBRO)
    @ApiOperation({ summary: 'Una membresía propia del miembro autenticado' })
    @ApiOkResponse({ type: MembresiaDetalleResponseDto })
    @ApiBadRequestResponse({ description: 'Id inválido.' })
    @ApiUnauthorizedResponse({ description: 'Sin sesión.' })
    @ApiForbiddenResponse({ description: 'La membresía es de otro miembro, o el usuario no es miembro.' })
    @ApiNotFoundResponse({ description: 'La membresía no existe.' })
    obtenerUna(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: User,
    ): Promise<MembresiaDetalleResponseDto> {
        return this.membresiasService.obtenerMiMembresia(id, user.id);
    }

    @Post()
    @Roles(Rol.RECEPCION)
    @ApiOperation({ summary: 'Registra la compra o renovación y genera el cobro pendiente' })
    @ApiCreatedResponse({ type: MembresiaRegistradaResponseDto })
    @ApiBadRequestResponse({ description: 'Datos inválidos o fecha de inicio fuera de rango.' })
    @ApiForbiddenResponse({ description: 'El usuario no es recepción.' })
    @ApiNotFoundResponse({ description: 'El miembro o el plan no existe.' })
    @ApiConflictResponse({ description: 'Plan inactivo u operación pendiente de pago.' })
    registrar(
        @Body() dto: OperacionMembresiaDto,
        @CurrentUser() user: User,
    ): Promise<MembresiaRegistradaResponseDto> {
        return this.registroService.registrar(dto, user.id);
    }
}
