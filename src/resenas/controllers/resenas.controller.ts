import { Body, Controller, Get, Post } from '@nestjs/common';
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
import { ResenasService } from '@Resenas/services';
import { CrearResenaDto, PendienteResenaDto, ResenaResponseDto } from '@Resenas/dto';
import { Rol, type User } from '@PrismaClient';

// Reseñas de clases y sesiones (H20). Solo el miembro califica.
@ApiTags('resenas')
@ApiBearerAuth()
@Roles(Rol.MIEMBRO)
@Controller('resenas')
export class ResenasController {
    constructor(private readonly resenasService: ResenasService) { }

    @Get('pendientes')
    @ApiOperation({
        summary: 'Clases y sesiones que el miembro todavía puede calificar',
        description:
            'Las de los últimos 7 días en las que el entrenador registró su asistencia como ' +
            'Asistió y que todavía no calificó.',
    })
    @ApiOkResponse({ type: PendienteResenaDto, isArray: true })
    @ApiForbiddenResponse({ description: 'El usuario no es miembro.' })
    pendientes(@CurrentUser() user: User): Promise<PendienteResenaDto[]> {
        return this.resenasService.pendientes(user.id);
    }

    @Post()
    @ApiOperation({
        summary: 'Guarda la reseña de una clase o sesión',
        description:
            'Las tres calificaciones son opcionales, pero hay que dar al menos una. El ' +
            'entrenador y el tipo de clase se copian del registro en el servidor.',
    })
    @ApiCreatedResponse({ type: ResenaResponseDto })
    @ApiBadRequestResponse({
        description: 'Sin ninguna calificación, o con valores fuera de 1 a 5.',
    })
    @ApiForbiddenResponse({
        description: 'El usuario no es miembro, o la clase o sesión es de otro miembro.',
    })
    @ApiNotFoundResponse({ description: 'La clase o sesión no existe.' })
    @ApiConflictResponse({
        description: 'Sin asistencia registrada, fuera del plazo de 7 días, o ya calificada.',
    })
    crear(@CurrentUser() user: User, @Body() dto: CrearResenaDto): Promise<ResenaResponseDto> {
        return this.resenasService.crear(user.id, dto);
    }
}
