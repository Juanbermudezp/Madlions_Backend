import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiConflictResponse,
    ApiForbiddenResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import { CobrosService, PagosService } from '@Cobros/services';
import { CobroResponseDto, CobrosQueryDto, PagarCobroDto, PagoResponseDto } from '@Cobros/dto';
import { Rol, type User } from '@PrismaClient';

/** Cobros del miembro (H12). Solo MIEMBRO; los demás roles reciben 403. */
@ApiTags('cobros')
@ApiBearerAuth()
@Controller('cobros')
export class CobrosController {
    constructor(
        private readonly cobrosService: CobrosService,
        private readonly pagosService: PagosService,
    ) { }

    @Get('mios')
    @Roles(Rol.MIEMBRO)
    @ApiOperation({ summary: 'Cobros del miembro autenticado (el miembro sale del token)' })
    @ApiOkResponse({ type: CobroResponseDto, isArray: true })
    @ApiBadRequestResponse({ description: 'Estado inválido.' })
    @ApiUnauthorizedResponse({ description: 'Sin sesión.' })
    @ApiForbiddenResponse({ description: 'El usuario no es miembro.' })
    listarMios(@Query() query: CobrosQueryDto, @CurrentUser() user: User): Promise<CobroResponseDto[]> {
        return this.cobrosService.listarMios(user.id, query.estado);
    }

    @Post(':id/pagar')
    @HttpCode(HttpStatus.OK)
    @Roles(Rol.MIEMBRO)
    @ApiOperation({ summary: 'Paga un cobro propio con la pasarela simulada (tarda 2 segundos)' })
    @ApiOkResponse({ type: PagoResponseDto, description: 'APROBADO, RECHAZADO o ERROR (en los dos últimos el cobro sigue PENDIENTE).' })
    @ApiBadRequestResponse({ description: 'Datos de la tarjeta inválidos o id inválido.' })
    @ApiUnauthorizedResponse({ description: 'Sin sesión.' })
    @ApiForbiddenResponse({ description: 'El cobro es de otro miembro, o el usuario no es miembro.' })
    @ApiNotFoundResponse({ description: 'El cobro no existe.' })
    @ApiConflictResponse({ description: 'El cobro ya está pagado, o es una renovación que todavía no se puede pagar.' })
    pagar(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() tarjeta: PagarCobroDto,
        @CurrentUser() user: User,
    ): Promise<PagoResponseDto> {
        return this.pagosService.pagar(id, user.id, tarjeta);
    }
}
