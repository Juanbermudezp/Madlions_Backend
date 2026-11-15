import { Body, Controller, Get, Post, Query } from '@nestjs/common';
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
import { CurrentUser, Roles } from '@Auth/decorators';
import { RegistroMembresiaService } from '@Membresias/services';
import {
    MembresiaRegistradaResponseDto,
    OperacionMembresiaDto,
    ResumenMembresiaResponseDto,
} from '@Membresias/dto';
import { Rol, type User } from '@PrismaClient';

/**
 * Compra o renovación de membresías (H2, BE-2.3). Solo recepción registra;
 * los demás roles reciben 403.
 */
@ApiTags('membresias')
@ApiBearerAuth()
@Controller('membresias')
export class MembresiasController {
    constructor(private readonly registroService: RegistroMembresiaService) { }

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
