import { BadRequestException } from '@nestjs/common';
import { TipoProgreso } from '@PrismaClient';
import { esFechaValida, hoyLocal } from '../../common/fechas/fechas.js';

export interface MedicionNormalizada {
  tipo: TipoProgreso;
  valor: number;
  ejercicio: string | null;
  repeticiones: number | null;
}
export interface EntradaMedicion {
  tipo: TipoProgreso;
  valor: number;
  ejercicio?: string | null;
  repeticiones?: number | null;
}

export function validarFechaRegistro(fecha: string, ahora: Date): Date {
  if (!esFechaValida(fecha)) {
    throw new BadRequestException('La fecha no es válida.');
  }
  if (fecha > hoyLocal(ahora)) {
    throw new BadRequestException('No puedes registrar una fecha futura.');
  }
  // DATE: representamos la fecha de calendario a medianoche UTC, nunca como
  // un instante local de El Salvador (evita cambiar de día al serializar).
  return new Date(`${fecha}T00:00:00.000Z`);
}

export function validarFiltroFechas(desde?: string, hasta?: string): void {
  if ((desde && !esFechaValida(desde)) || (hasta && !esFechaValida(hasta))) {
    throw new BadRequestException('El rango de fechas contiene una fecha inválida.');
  }
  if (desde && hasta && desde > hasta) {
    throw new BadRequestException('La fecha desde no puede ser posterior a hasta.');
  }
}

export function validarMedicion(entrada: EntradaMedicion): MedicionNormalizada {
  const { tipo, valor } = entrada;
  const esMarca = tipo === TipoProgreso.MARCA;
  const min = tipo === TipoProgreso.PESO ? 20 : esMarca ? 0.5 : 10;
  const max = tipo === TipoProgreso.PESO ? 300 : esMarca ? 500 : 250;

  if (
    !Object.values(TipoProgreso).includes(tipo) ||
    typeof valor !== 'number' ||
    !Number.isFinite(valor) ||
    valor < min ||
    valor > max ||
    !Number.isInteger(valor * 10)
  ) {
    throw new BadRequestException(
      `El valor para ${tipo} debe estar entre ${min.toFixed(1)} y ${max.toFixed(1)}, con un decimal como máximo.`,
    );
  }

  if (!esMarca) {
    if (entrada.ejercicio != null || entrada.repeticiones != null) {
      throw new BadRequestException('Ejercicio y repeticiones solo aplican a MARCA.');
    }
    return { tipo, valor, ejercicio: null, repeticiones: null };
  }

  const ejercicio = entrada.ejercicio?.trim().replace(/\s+/g, ' ') ?? '';
  const repeticiones = entrada.repeticiones;
  if (ejercicio.length < 1 || ejercicio.length > 60) {
    throw new BadRequestException('La marca requiere un ejercicio de 1 a 60 caracteres.');
  }
  if (typeof repeticiones !== 'number' || !Number.isInteger(repeticiones) || repeticiones < 1 || repeticiones > 100) {
    throw new BadRequestException('Las repeticiones deben estar entre 1 y 100.');
  }
  return { tipo, valor, ejercicio, repeticiones };
}

function redondearUnDecimal(numero: number): number {
  const resultado = Math.sign(numero) * Math.round((Math.abs(numero) + Number.EPSILON) * 10) / 10;
  return Object.is(resultado, -0) ? 0 : resultado;
}

/** La DB guarda Decimal(5,1); comparar décimas evita ruido binario. */
export function calcularEvolucion(valoresOrdenados: number[]): {
  primero: number | null;
  ultimo: number | null;
  diferencia: number | null;
  porcentaje: number | null;
} {
  if (valoresOrdenados.length === 0) {
    return { primero: null, ultimo: null, diferencia: null, porcentaje: null };
  }
  const primero = valoresOrdenados[0]!;
  const ultimo = valoresOrdenados[valoresOrdenados.length - 1]!;
  if (valoresOrdenados.length < 2) {
    return { primero, ultimo, diferencia: null, porcentaje: null };
  }
  const diferencia = Math.round(ultimo * 10 - primero * 10) / 10;
  const porcentaje = redondearUnDecimal((diferencia / primero) * 100);
  return { primero, ultimo, diferencia, porcentaje };
}
