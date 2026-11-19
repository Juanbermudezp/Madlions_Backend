import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, ValidateBy } from 'class-validator';
import { ConceptoCobro, EstadoCobro } from '@PrismaClient';
import { ESTADO_COBRO_INVALIDO } from './cobros-query.dto.js';

export const CONCEPTO_COBRO_INVALIDO = 'El concepto debe ser MEMBRESIA, RENOVACION o SESION_ADICIONAL.';
export const BUSQUEDA_COBRO_INVALIDA = 'La búsqueda puede tener hasta 100 caracteres.';
export const PAGINA_INVALIDA = 'La página debe ser un número entero mayor o igual que 1.';

/** Largo máximo del texto de búsqueda. */
export const BUSQUEDA_MAX = 100;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** "3" -> 3. Cualquier otra cosa se deja igual para que la validación la rechace. */
const aEntero = ({ value }: { value: unknown }) =>
    typeof value === 'string' && /^\d{1,9}$/.test(value) ? Number(value) : value;

/** Un solo decorador por campo, para devolver un único mensaje (convención del equipo). */
const regla = (nombre: string, validar: (valor: unknown) => boolean, mensaje: string) =>
    ValidateBy({ name: nombre, validator: { validate: validar } }, { message: mensaje });

/**
 * Query de GET /cobros (H13, BE-13.1). Todos los filtros son opcionales:
 * sin `estado` se listan los PENDIENTE y sin `pagina` se devuelve la 1.
 * Un filtro con un valor que no corresponde responde 400.
 */
export class CobrosAdminQueryDto {
    @ApiPropertyOptional({ enum: EstadoCobro, default: EstadoCobro.PENDIENTE })
    @IsOptional()
    @IsIn(Object.values(EstadoCobro), { message: ESTADO_COBRO_INVALIDO })
    estado?: EstadoCobro;

    @ApiPropertyOptional({ enum: ConceptoCobro })
    @IsOptional()
    @IsIn(Object.values(ConceptoCobro), { message: CONCEPTO_COBRO_INVALIDO })
    concepto?: ConceptoCobro;

    @ApiPropertyOptional({
        example: 'López',
        description: 'Nombre y/o apellido (sin importar mayúsculas ni tildes) o código del miembro.',
    })
    @IsOptional()
    @Transform(trim)
    @regla('busquedaCobroValida', (v) => typeof v === 'string' && v.length <= BUSQUEDA_MAX, BUSQUEDA_COBRO_INVALIDA)
    q?: string;

    @ApiPropertyOptional({ minimum: 1, default: 1 })
    @IsOptional()
    @Transform(aEntero)
    @regla('paginaValida', (v) => typeof v === 'number' && Number.isInteger(v) && v >= 1, PAGINA_INVALIDA)
    pagina?: number;
}