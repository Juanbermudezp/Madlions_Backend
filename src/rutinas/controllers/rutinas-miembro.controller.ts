import { Controller, Get, Header, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import { Rol, type User } from '@PrismaClient';
import { RutinasMiembroService } from '../services/rutinas-miembro.service.js';
import { RutinaPropiaDetalleDto, RutinaPropiaResumenDto } from '../dto/rutina-propia-response.dto.js';

@ApiTags('rutinas')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Sin autenticación válida.' })
@ApiForbiddenResponse({ description: 'Rol no permitido o rutina asignada a otro miembro.' })
@ApiNotFoundResponse({ description: 'Ficha de miembro o rutina inexistente.' })
@Roles(Rol.MIEMBRO)
@Controller('rutinas')
export class RutinasMiembroController {
  constructor(private readonly service: RutinasMiembroService) {}

  // Mantener esta ruta estática antes de :id. H14 mantiene su propio controlador.
  @Get('mias')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Lista las rutinas de la ficha del miembro autenticado, de más reciente a más antigua' })
  @ApiOkResponse({ type: RutinaPropiaResumenDto, isArray: true })
  listar(@CurrentUser() usuario: User): Promise<RutinaPropiaResumenDto[]> {
    return this.service.listar(usuario.id);
  }

  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Consulta la versión actual de una rutina asignada al miembro autenticado' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'UUID de la rutina.' })
  @ApiBadRequestResponse({ description: 'UUID inválido.' })
  @ApiOkResponse({ type: RutinaPropiaDetalleDto })
  detalle(@CurrentUser() usuario: User, @Param('id', ParseUUIDPipe) id: string): Promise<RutinaPropiaDetalleDto> {
    return this.service.detalle(usuario.id, id);
  }
}
