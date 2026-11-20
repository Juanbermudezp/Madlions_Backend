import { sumarDias } from '@Common/fechas';
import { Prisma, ConceptoCobro, TipoPlan } from '@PrismaClient';
import type { FilaIngreso } from '../repositories/reportes.repository.js';
import type { ReporteIngresosResponseDto } from '../dto/reporte-ingresos-response.dto.js';
import { TASA_IVA } from '../../cobros/services/reglas-pago.js';

// Configuración local: no cambia Decimal global ni las reglas/comprobantes H12.
const Decimal = Prisma.Decimal.clone({ precision: 40, rounding: Prisma.Decimal.ROUND_HALF_UP });
const FACTOR_IVA = new Decimal(1).plus(TASA_IVA.toString());

/** Los días se cuentan en UTC sobre fechas de calendario, sin depender del TZ del proceso. */
export function periodoAnterior(desde: string, hasta: string) {
    const dias = (new Date(`${hasta}T00:00:00Z`).getTime() - new Date(`${desde}T00:00:00Z`).getTime()) / 86_400_000 + 1;
    return { desde: sumarDias(desde, -dias), hasta: sumarDias(desde, -1) };
}

/** S7/H12: mismo criterio que desglosarIva(), con Decimal en lugar de sus
 * centavos number para que un reporte agregado no pierda precisión al sumar.
 */
export function desglosarIvaIngresos(total: Prisma.Decimal) {
    const monto = new Decimal(total);
    const subtotal = monto.div(FACTOR_IVA).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    return { total: monto, subtotal, iva: monto.minus(subtotal) };
}

/** La consulta ya agrega en PostgreSQL. Se acumulan sus filas usando Decimal;
 * solo al construir el DTO HTTP se convierten los importes a number.
 */
export function resumirIngresos(filas: FilaIngreso[], desde: string, hasta: string): ReporteIngresosResponseDto {
    const conceptos = new Map(Object.values(ConceptoCobro).map((concepto) => [concepto, new Decimal(0)]));
    const planes = new Map(Object.values(TipoPlan).map((tipo) => [tipo, new Decimal(0)]));
    const dias = new Map<string, Prisma.Decimal>();
    for (let dia = desde; dia <= hasta; dia = sumarDias(dia, 1)) dias.set(dia, new Decimal(0));
    let anterior = new Decimal(0);
    for (const fila of filas) {
        if (fila.fecha < desde) { anterior = anterior.plus(fila.total); continue; }
        conceptos.set(fila.concepto, conceptos.get(fila.concepto)!.plus(fila.total));
        dias.set(fila.fecha, dias.get(fila.fecha)!.plus(fila.total));
        if (fila.concepto !== ConceptoCobro.SESION_ADICIONAL && fila.tipoPlan !== null) {
            planes.set(fila.tipoPlan, planes.get(fila.tipoPlan)!.plus(fila.total));
        }
    }
    const total = [...conceptos.values()].reduce((suma, monto) => suma.plus(monto), new Decimal(0));
    const montos = desglosarIvaIngresos(total);
    const diferencia = total.minus(anterior);
    const porcentaje = anterior.isZero() ? null : diferencia.div(anterior).times(100).toDecimalPlaces(1, Decimal.ROUND_HALF_UP);
    return {
        total: montos.total.toNumber(), subtotal: montos.subtotal.toNumber(), iva: montos.iva.toNumber(),
        porConcepto: [...conceptos].map(([concepto, monto]) => ({ concepto, total: monto.toNumber() })),
        porTipoPlan: [...planes].map(([tipoPlan, monto]) => ({ tipoPlan, total: monto.toNumber() })),
        porDia: [...dias].map(([fecha, monto]) => ({ fecha, total: monto.toNumber() })),
        anterior: { total: anterior.toNumber(), diferencia: diferencia.toNumber(), porcentaje: porcentaje?.toNumber() ?? null },
    };
}
