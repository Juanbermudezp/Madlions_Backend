import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import { CancelacionClaseService } from '../services/cancelacion-clase.service.js';
import { CancelarClaseDto, ClaseCanceladaResponseDto } from '@Clases/dto';
import { Rol, type User } from '@PrismaClient';

@ApiTags('clases')
@ApiBearerAuth()
@Controller('clases')
export class CancelacionClaseController {
    constructor(private readonly cancelacion: CancelacionClaseService) {}

    @Post(':id/cancelar')
    @HttpCode(200)
    @Roles(Rol.ADMINISTRADOR)
    @ApiOperation({ summary: 'Cancela una clase futura, libera las reservas confirmadas y notifica (H7/BE-25.1)' })
    @ApiOkResponse({ type: ClaseCanceladaResponseDto })
    @ApiBadRequestResponse({ description: 'UUID inválido o motivo de cancelación inválido (10–250 caracteres).' })
    @ApiUnauthorizedResponse({ description: 'Sin sesión o token inválido.' })
    @ApiForbiddenResponse({ description: 'Solo ADMINISTRADOR puede cancelar clases.' })
    @ApiNotFoundResponse({ description: 'La clase no existe.' })
    @ApiConflictResponse({ description: 'La clase ya comenzó, terminó o fue cancelada.' })
    cancelar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelarClaseDto, @CurrentUser() user: User): Promise<ClaseCanceladaResponseDto> {
        return this.cancelacion.cancelar(id, dto.motivo, user.id);
    }
}
