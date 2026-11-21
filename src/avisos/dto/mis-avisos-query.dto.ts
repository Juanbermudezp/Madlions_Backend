import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, ValidateBy } from 'class-validator';

export const SOLO_NO_LEIDOS_INVALIDO = 'soloNoLeidos debe ser true o false.';
export const PAGINA_AVISOS_INVALIDA =
  'La página debe ser un número entero mayor o igual que 1.';

/** "true" -> true, "false" -> false. Cualquier otra cosa se deja igual para que la validación la rechace. */
const aBooleano = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

/** "3" -> 3. Cualquier otra cosa se deja igual para que la validación la rechace. */
const aEntero = ({ value }: { value: unknown }) =>
  typeof value === 'string' && /^\d{1,9}$/.test(value) ? Number(value) : value;

/** Un solo decorador por campo, para devolver un único mensaje (convención del equipo). */
const regla = (
  nombre: string,
  validar: (valor: unknown) => boolean,
  mensaje: string,
) =>
  ValidateBy(
    { name: nombre, validator: { validate: validar } },
    { message: mensaje },
  );

/** Query de GET /avisos/mios (H23, BE-23.1). Sin parámetros: todos los avisos, página 1. */
export class MisAvisosQueryDto {
  @ApiPropertyOptional({
    type: Boolean,
    default: false,
    description: 'true: solo los avisos sin leer.',
  })
  @IsOptional()
  @Transform(aBooleano)
  @regla(
    'soloNoLeidosValido',
    (v) => typeof v === 'boolean',
    SOLO_NO_LEIDOS_INVALIDO,
  )
  soloNoLeidos?: boolean;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Transform(aEntero)
  @regla(
    'paginaAvisosValida',
    (v) => typeof v === 'number' && Number.isInteger(v) && v >= 1,
    PAGINA_AVISOS_INVALIDA,
  )
  pagina?: number;
}
