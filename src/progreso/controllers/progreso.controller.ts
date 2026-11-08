import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import { Rol, type User } from '@PrismaClient';
import { CreateProgresoDto, ProgresoQueryDto, UpdateProgresoDto } from '../dto/index.js';
import { ProgresoService } from '../services/progreso.service.js';

@ApiTags('progreso')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Solo el miembro dueño puede consultar o editar.' })
@Roles(Rol.MIEMBRO)
@Controller('progreso')
export class ProgresoController {
  constructor(private readonly service: ProgresoService) {}

  @Post()
  @ApiOperation({ summary: 'Registra una o más mediciones del miembro autenticado' })
  @ApiCreatedResponse({ description: 'Registros guardados.' })
  @ApiBadRequestResponse({ description: 'Fecha futura, medición fuera de rango o datos faltantes.' })
  @ApiConflictResponse({ description: 'Ya registraste esta medición en esa fecha.' })
  crear(@CurrentUser() usuario: User, @Body() dto: CreateProgresoDto) {
    return this.service.crear(usuario.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita una medición propia (el tipo es inmutable)' })
  @ApiOkResponse({ description: 'Registro actualizado.' })
  @ApiConflictResponse({ description: 'Medición repetida en la fecha.' })
  editar(
    @CurrentUser() usuario: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProgresoDto,
  ) {
    return this.service.editar(usuario.id, id, dto);
  }

  @Get('mio')
  @ApiOperation({ summary: 'Consulta las series y su evolución, con filtros opcionales' })
  @ApiOkResponse({ description: 'Series del miembro autenticado.' })
  listar(@CurrentUser() usuario: User, @Query() query: ProgresoQueryDto) {
    return this.service.listarMio(usuario.id, query);
  }
}
