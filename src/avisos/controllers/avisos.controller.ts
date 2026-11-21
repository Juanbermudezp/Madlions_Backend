import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import {
  AvisoDetalleDto,
  ConteoNoLeidosDto,
  MarcarTodosLeidosDto,
  MisAvisosQueryDto,
  MisAvisosResponseDto,
} from '@Avisos/dto';
import { AvisosBandejaService } from '@Avisos/services';
import { Rol, type User } from '@PrismaClient';

/**
 * Bandeja de avisos del miembro (H23, BE-23.1). Solo lectura y marcado como
 * leído: los avisos se crean únicamente con AvisosService (H22), nunca desde
 * la API. El miembro sale del token; ninguna ruta recibe un id de miembro.
 */
@ApiTags('avisos')
@ApiBearerAuth()
@Controller('avisos')
export class AvisosController {
  constructor(private readonly bandeja: AvisosBandejaService) {}

  @Get('mios')
  @Roles(Rol.MIEMBRO)
  @ApiOperation({
    summary:
      'Avisos del miembro autenticado, de 20 en 20, del más reciente al más antiguo',
  })
  @ApiOkResponse({ type: MisAvisosResponseDto })
  @ApiBadRequestResponse({
    description: 'soloNoLeidos no es true/false o la página es menor que 1.',
  })
  @ApiUnauthorizedResponse({ description: 'Sin sesión.' })
  @ApiForbiddenResponse({ description: 'El usuario no es miembro.' })
  listarMios(
    @CurrentUser() user: User,
    @Query() query: MisAvisosQueryDto,
  ): Promise<MisAvisosResponseDto> {
    return this.bandeja.listar(user.id, query);
  }

  /** Va antes de `:id` para que "no-leidos" no se tome como un id. */
  @Get('no-leidos/conteo')
  @Roles(Rol.MIEMBRO)
  @ApiOperation({
    summary: 'Cantidad de avisos sin leer del miembro autenticado',
  })
  @ApiOkResponse({ type: ConteoNoLeidosDto })
  @ApiUnauthorizedResponse({ description: 'Sin sesión.' })
  @ApiForbiddenResponse({ description: 'El usuario no es miembro.' })
  contarNoLeidos(@CurrentUser() user: User): Promise<ConteoNoLeidosDto> {
    return this.bandeja.contarNoLeidos(user.id);
  }

  @Get(':id')
  @Roles(Rol.MIEMBRO)
  @ApiOperation({
    summary: 'Abrir un aviso propio: devuelve el mensaje y lo marca como leído',
  })
  @ApiOkResponse({ type: AvisoDetalleDto })
  @ApiBadRequestResponse({ description: 'El id no es un UUID.' })
  @ApiNotFoundResponse({ description: 'El aviso no existe.' })
  @ApiUnauthorizedResponse({ description: 'Sin sesión.' })
  @ApiForbiddenResponse({
    description: 'El aviso es de otro miembro, o el usuario no es miembro.',
  })
  abrir(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<AvisoDetalleDto> {
    return this.bandeja.abrir(user.id, id);
  }

  /** Sin cuerpo: solo afecta los avisos del miembro del token. */
  @Post('marcar-todos-leidos')
  @HttpCode(HttpStatus.OK)
  @Roles(Rol.MIEMBRO)
  @ApiOperation({
    summary: 'Marcar como leídos todos los avisos del miembro autenticado',
  })
  @ApiOkResponse({ type: MarcarTodosLeidosDto })
  @ApiUnauthorizedResponse({ description: 'Sin sesión.' })
  @ApiForbiddenResponse({ description: 'El usuario no es miembro.' })
  marcarTodosLeidos(@CurrentUser() user: User): Promise<MarcarTodosLeidosDto> {
    return this.bandeja.marcarTodosLeidos(user.id);
  }
}
