import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AvisoVencimientoRepository } from '@Avisos/repositories';
import { ZONA_HORARIA, hoyLocal, sumarDias } from '@Common/fechas';
import {
  DIAS_PROXIMA_A_VENCER,
  EstadoMembresiaService,
  type EstadoMembresiaDetalle,
} from '@Membresias/services';
import { ModuloOrigen, TipoPlan } from '@PrismaClient';
import { AvisosService } from './avisos.service.js';

/** Todos los días a las 06:00 (hora de El Salvador). */
export const CRON_AVISOS_VENCIMIENTO = '0 6 * * *';

export const TITULO_VENCIMIENTO = 'Tu membresía vence pronto';

export interface ResultadoAvisosVencimiento {
  /** Día revisado, AAAA-MM-DD en hora de El Salvador. */
  dia: string;
  /** Membresías que cumplían las condiciones y se intentaron avisar. */
  avisadas: number;
  creados: number;
  omitidosPorDuplicado: number;
  /** Avisos que no se pudieron registrar (quedan en el log). */
  fallidos: number;
}

/** Una por membresía: la tarea nunca repite el aviso de la misma membresía (H24). */
export const referenciaVencimiento = (membresiaId: string) =>
  `membresia-${membresiaId}-vence`;

/** "2026-11-23" → "23/11/2026". */
const aDiaMesAnio = (fecha: string) => fecha.split('-').reverse().join('/');

/** Mensaje del criterio 2 de H24. */
export function mensajeVencimiento(
  estado: Pick<
    EstadoMembresiaDetalle,
    'plan' | 'fechaVencimiento' | 'creditosDisponibles'
  >,
): string {
  const base =
    `Tu plan ${estado.plan} vence el ${aDiaMesAnio(estado.fechaVencimiento!)}. ` +
    'Desde esa fecha puedes pagar tu renovación; acércate a recepción para registrarla.';
  return estado.creditosDisponibles === null
    ? base
    : `${base} Te quedan ${estado.creditosDisponibles} clases por usar.`;
}

/**
 * Le toca aviso si su membresía está "Próxima a vencer" (3 días o menos, la
 * misma regla que S5) y no tiene la renovación pagada. Un Daypass nunca está
 * "Próxima a vencer" porque vence el mismo día en que se paga.
 */
export function debeAvisarse(estado: EstadoMembresiaDetalle): boolean {
  return (
    estado.estado === 'PROXIMA_A_VENCER' &&
    estado.membresiaId !== null &&
    estado.fechaVencimiento !== null &&
    estado.tipoPlan !== TipoPlan.DAYPASS &&
    estado.renovacion?.estado !== 'POR_INICIAR'
  );
}

/**
 * Avisos de próximo vencimiento de membresía (H24, BE-24.1).
 *
 * Todos los días a las 06:00 (UTC-6) revisa las membresías que vencen entre
 * hoy y hoy + 3 y avisa por AvisosService (H22). No duplica: la referencia
 * membresia-{id}-vence es única por miembro, así que correrla dos veces el
 * mismo día, o volver a revisar una membresía ya avisada después de un día sin
 * correr, solo suma omitidos.
 */
@Injectable()
export class AvisosVencimientoService {
  private readonly logger = new Logger(AvisosVencimientoService.name);

  constructor(
    private readonly repo: AvisoVencimientoRepository,
    private readonly estadoMembresia: EstadoMembresiaService,
    private readonly avisos: AvisosService,
  ) {}

  @Cron(CRON_AVISOS_VENCIMIENTO, {
    name: 'avisos-vencimiento-membresia',
    timeZone: ZONA_HORARIA,
  })
  ejecutar(): Promise<ResultadoAvisosVencimiento> {
    return this.avisarVencimientos(new Date());
  }

  /** Recibe `ahora` para poder probarla con un reloj simulado. */
  async avisarVencimientos(ahora: Date): Promise<ResultadoAvisosVencimiento> {
    const dia = hoyLocal(ahora);
    const miembroIds = await this.repo.miembrosConVencimientoEntre(
      dia,
      sumarDias(dia, DIAS_PROXIMA_A_VENCER),
    );
    const estados = await this.estadoMembresia.estadosDe(miembroIds, dia);

    const resultado: ResultadoAvisosVencimiento = {
      dia,
      avisadas: 0,
      creados: 0,
      omitidosPorDuplicado: 0,
      fallidos: 0,
    };
    for (const [miembroId, estado] of estados) {
      if (!debeAvisarse(estado)) continue;
      resultado.avisadas++;
      try {
        const { creados, omitidosPorDuplicado } = await this.avisos.enviar({
          destinatarios: [miembroId],
          titulo: TITULO_VENCIMIENTO,
          mensaje: mensajeVencimiento(estado),
          moduloOrigen: ModuloOrigen.MEMBRESIAS,
          referencia: referenciaVencimiento(estado.membresiaId!),
        });
        resultado.creados += creados;
        resultado.omitidosPorDuplicado += omitidosPorDuplicado;
      } catch (error) {
        // Un aviso que falla no detiene a los demás.
        resultado.fallidos++;
        this.logger.error(
          `No se pudo avisar el vencimiento de la membresía ${estado.membresiaId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    this.logger.log(
      `Avisos de vencimiento del ${dia}: ${resultado.creados} creado(s), ` +
        `${resultado.omitidosPorDuplicado} omitido(s) por duplicado` +
        (resultado.fallidos ? `, ${resultado.fallidos} con error.` : '.'),
    );
    return resultado;
  }
}
