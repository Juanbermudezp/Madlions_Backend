import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ValidateBy } from 'class-validator';

export const BUSQUEDA_INVALIDA = 'La búsqueda debe tener entre 2 y 50 caracteres.';

const trim = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value;

/** Texto de 2 a 50 caracteres (ya sin espacios en los extremos). */
export function esBusquedaValida(valor: unknown): boolean {
    return typeof valor === 'string' && valor.length >= 2 && valor.length <= 50;
}

/**
 * Query de GET /miembros/buscar. Se valida con un solo decorador para que un
 * `q` faltante o inválido devuelva un único mensaje.
 */
export class BuscarMiembrosQueryDto {
    @ApiProperty({
        example: 'maria',
        minLength: 2,
        maxLength: 50,
        description: 'Nombre o apellido (sin importar mayúsculas ni tildes), documento o código exactos.',
    })
    @Transform(trim)
    @ValidateBy(
        { name: 'esBusquedaValida', validator: { validate: esBusquedaValida } },
        { message: BUSQUEDA_INVALIDA },
    )
    q!: string;
}
