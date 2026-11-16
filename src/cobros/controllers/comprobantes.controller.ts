import { Controller, Get, Param } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiForbiddenResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import { ComprobantesService } from '@Cobros/services';
import { ComprobanteResponseDto } from '@Cobros/dto';
import { Rol, type User } from '@PrismaClient';

/** Comprobantes de pago (H12). El miembro ve los suyos; el administrador, todos. */
@ApiTags('comprobantes')
@ApiBearerAuth()
@Controller('comprobantes')
export class ComprobantesController {
    constructor(private readonly comprobantesService: ComprobantesService) { }

    @Get(':numero')
    @Roles(Rol.MIEMBRO, Rol.ADMINISTRADOR)
    @ApiOperation({ summary: 'Comprobante de un pago aprobado (CMP-000001)' })
    @ApiOkResponse({ type: ComprobanteResponseDto })
    @ApiUnauthorizedResponse({ description: 'Sin sesión.' })
    @ApiForbiddenResponse({ description: 'Es de otro miembro, o el rol no puede ver comprobantes.' })
    @ApiNotFoundResponse({ description: 'El comprobante no existe.' })
    obtener(@Param('numero') numero: string, @CurrentUser() user: User): Promise<ComprobanteResponseDto> {
        return this.comprobantesService.obtener(numero, user);
    }
}
