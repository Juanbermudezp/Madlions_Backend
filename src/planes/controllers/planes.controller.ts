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
import { CurrentUser, Roles } from '@Auth/decorators';
import { PlanesService } from '@Planes/services';
import { CreatePlanDto, PlanResponseDto, UpdatePlanDto } from '@Planes/dto';
import { Rol, type User } from '@PrismaClient';

/**
 * Planes del gimnasio (H1). Cualquier usuario con sesión los consulta; solo
 * el administrador los crea, edita o desactiva: los demás roles reciben 403.
 */
@ApiTags('planes')
@ApiBearerAuth()
@Controller('planes')
export class PlanesController {
    constructor(private readonly planesService: PlanesService) { }

    @Get()
    @ApiOperation({ summary: 'Lista los planes (el administrador también ve los inactivos)' })
    @ApiOkResponse({ type: PlanResponseDto, isArray: true })
    listar(@CurrentUser() user: User): Promise<PlanResponseDto[]> {
        return this.planesService.listar(user.rol);
    }

    @Post()
    @Roles(Rol.ADMINISTRADOR)
    @ApiOperation({ summary: 'Registra un plan' })
    @ApiCreatedResponse({ type: PlanResponseDto })
    @ApiBadRequestResponse({ description: 'Campos inválidos o tipo de clase inexistente.' })
    @ApiForbiddenResponse({ description: 'El usuario no es administrador.' })
    @ApiConflictResponse({ description: 'Ya existe un plan con ese nombre' })
    crear(@Body() dto: CreatePlanDto): Promise<PlanResponseDto> {
        return this.planesService.crear(dto);
    }

    @Patch(':id')
    @Roles(Rol.ADMINISTRADOR)
    @ApiOperation({ summary: 'Edita un plan (el tipo no se puede cambiar)' })
    @ApiOkResponse({ type: PlanResponseDto })
    @ApiBadRequestResponse({ description: 'Id o campos inválidos, o tipo de clase inexistente.' })
    @ApiForbiddenResponse({ description: 'El usuario no es administrador.' })
    @ApiNotFoundResponse({ description: 'El plan no existe.' })
    @ApiConflictResponse({ description: 'Ya existe un plan con ese nombre' })
    actualizar(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdatePlanDto,
    ): Promise<PlanResponseDto> {
        return this.planesService.actualizar(id, dto);
    }

    @Patch(':id/desactivar')
    @Roles(Rol.ADMINISTRADOR)
    @ApiOperation({ summary: 'Desactiva un plan' })
    @ApiOkResponse({ type: PlanResponseDto })
    @ApiBadRequestResponse({ description: 'Id inválido.' })
    @ApiForbiddenResponse({ description: 'El usuario no es administrador.' })
    @ApiNotFoundResponse({ description: 'El plan no existe.' })
    @ApiConflictResponse({ description: 'El plan ya está inactivo.' })
    desactivar(@Param('id', ParseUUIDPipe) id: string): Promise<PlanResponseDto> {
        return this.planesService.desactivar(id);
    }
}
