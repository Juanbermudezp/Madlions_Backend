import { Controller, Get, Query } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiForbiddenResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import { ClasesService } from '@Clases/services';
import { ClaseResponseDto } from '@Clases/dto';
import { SemanaQueryDto } from '@Common/dto';
import { Rol, type User } from '@PrismaClient';

@ApiTags('clases')
@ApiBearerAuth()
@Roles(Rol.ENTRENADOR)
@Controller('clases')
export class ClasesController {
    constructor(private readonly clasesService: ClasesService) { }

    /** El entrenador sale del token; no se acepta un id de entrenador por query. */
    @Get('mias')
    @ApiOperation({ summary: 'Clases programadas del entrenador en una semana' })
    @ApiOkResponse({ type: ClaseResponseDto, isArray: true })
    @ApiForbiddenResponse({ description: 'El usuario no es entrenador.' })
    listarMias(
        @CurrentUser() user: User,
        @Query() query: SemanaQueryDto,
    ): Promise<ClaseResponseDto[]> {
        return this.clasesService.listarSemana(user.id, query.semana);
    }
}