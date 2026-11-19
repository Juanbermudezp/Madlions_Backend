import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiCreatedResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import { Rol, type User } from '@PrismaClient';
import { CreateRutinaDto, RutinaResponseDto, RutinasQueryDto, UpdateRutinaDto } from '../dto/index.js';
import { RutinasService } from '../services/rutinas.service.js';

@ApiTags('rutinas')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Sin autenticación válida.' })
@ApiForbiddenResponse({ description: 'Rol no permitido o rutina de otro entrenador.' })
@ApiBadRequestResponse({ description: 'UUID, fecha o datos inválidos.' })
@ApiNotFoundResponse({ description: 'Miembro o rutina inexistente.' })
@Roles(Rol.ENTRENADOR)
@Controller('rutinas')
export class RutinasController {
  constructor(private readonly service: RutinasService) {}

  @Post()
  @ApiOperation({ summary: 'Crea y asigna una rutina al miembro indicado' })
  @ApiCreatedResponse({ type: RutinaResponseDto })
  crear(@CurrentUser() usuario: User, @Body() dto: CreateRutinaDto) {
    return this.service.crear(usuario.id, dto);
  }

  @Get('creadas-por-mi')
  @ApiOperation({ summary: 'Consulta únicamente las rutinas creadas por el entrenador autenticado' })
  @ApiOkResponse({ type: RutinaResponseDto, isArray: true })
  listar(@CurrentUser() usuario: User, @Query() query: RutinasQueryDto) {
    return this.service.listar(usuario.id, query.miembroId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Reemplaza los datos editables, días y ejercicios de una rutina propia' })
  @ApiOkResponse({ type: RutinaResponseDto })
  actualizar(@CurrentUser() usuario: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRutinaDto) {
    return this.service.actualizar(id, usuario.id, dto);
  }
}
