import { sumarDias } from '@Common/fechas';
import { Prisma } from '@PrismaClient';
import type { FilaRenovacion } from '@Reportes/repositories';
import type { ReporteRenovacionResponseDto } from '@Reportes/dto';

/** Solo clasificación analítica, sin escribir estados de H2/H12. Una fecha
 * futura sin pago válido queda enPeriodo conforme a hoy <= vencimiento+7.
 */
export function resumirRenovacion(filas: FilaRenovacion[], hoy: string): ReporteRenovacionResponseDto {
    let renovadas = 0;
    let enPeriodo = 0;
    const canceladas: FilaRenovacion[] = [];
    for (const fila of filas) {
        if (fila.renovada) renovadas++;
        else if (hoy <= sumarDias(fila.fechaVencimiento, 7)) enPeriodo++;
        else canceladas.push(fila);
    }
    const denominador = renovadas + canceladas.length;
    const Decimal = Prisma.Decimal.clone({ precision: 40, rounding: Prisma.Decimal.ROUND_HALF_UP });
    const tasa = denominador === 0 ? null : new Decimal(renovadas).div(denominador).times(100).toDecimalPlaces(1);
    return { renovadas, canceladas: canceladas.length, enPeriodo,
        tasaRenovacion: tasa?.toNumber() ?? null,
        tasaCancelacion: tasa === null ? null : new Decimal(100).minus(tasa).toNumber(),
        noRenovaron: canceladas.sort((a, b) => b.fechaVencimiento.localeCompare(a.fechaVencimiento) || a.id.localeCompare(b.id))
            .map(({ nombre, codigo, plan, fechaVencimiento }) => ({ nombre, codigo, plan, fechaVencimiento })),
    };
}
