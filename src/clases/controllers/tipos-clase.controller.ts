import {
    Body,
    Controller,
    Get,
    Param,
    ParseUUIDPipe,
    Patch,
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
import { Roles } from '@Auth/decorators';
import { TiposClaseService } from '@Clases/services';
import {
    CreateTipoClaseDto,
    TipoClaseResponseDto,
    UpdateTipoClaseDto,
} from '@Clases/dto';
import { Rol } from '@PrismaClient';

/**
 * Catálogo de tipos de clase (H4, BE-4.1). Cualquier usuario con sesión lo
 * consulta (lo usan la agenda y los planes); solo el administrador lo
 * modifica: los demás roles reciben 403.
 */
@ApiTags('tipos-clase')
@ApiBearerAuth()
@Controller('tipos-clase')
export class TiposClaseController {
    constructor(private readonly tiposClaseService: TiposClaseService) { }

    @Get()
    @ApiOperation({ summary: 'Lista los tipos de clase activos' })
    @ApiOkResponse({ type: TipoClaseResponseDto, isArray: true })
    listar(): Promise<TipoClaseResponseDto[]> {
        return this.tiposClaseService.listar();
    }

    @Post()
    @Roles(Rol.ADMINISTRADOR)
    @ApiOperation({ summary: 'Registra un tipo de clase' })
    @ApiCreatedResponse({ type: TipoClaseResponseDto })
    @ApiBadRequestResponse({ description: 'Nombre o descripción inválidos.' })
    @ApiForbiddenResponse({ description: 'El usuario no es administrador.' })
    @ApiConflictResponse({ description: 'Ya existe un tipo de clase con ese nombre' })
    crear(@Body() dto: CreateTipoClaseDto): Promise<TipoClaseResponseDto> {
        return this.tiposClaseService.crear(dto);
    }

    @Patch(':id')
    @Roles(Rol.ADMINISTRADOR)
    @ApiOperation({ summary: 'Edita el nombre o la descripción de un tipo de clase' })
    @ApiOkResponse({ type: TipoClaseResponseDto })
    @ApiBadRequestResponse({ description: 'Id, nombre o descripción inválidos.' })
    @ApiForbiddenResponse({ description: 'El usuario no es administrador.' })
    @ApiNotFoundResponse({ description: 'El tipo de clase no existe.' })
    @ApiConflictResponse({ description: 'Ya existe un tipo de clase con ese nombre' })
    actualizar(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateTipoClaseDto,
    ): Promise<TipoClaseResponseDto> {
        return this.tiposClaseService.actualizar(id, dto);
    }
}
