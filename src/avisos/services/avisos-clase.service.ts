import { Injectable, Logger } from '@nestjs/common';
import { AvisoClaseRepository, type ClaseDelAviso } from '@Avisos/repositories';
import { ZONA_HORARIA } from '@Common/fechas';
import { ModuloOrigen } from '@PrismaClient';
import { AvisosService, type ResultadoEnvio } from './avisos.service.js';
import { MAX_MENSAJE, MAX_TITULO } from './reglas-aviso.js';

/** Un miembro con reserva "Confirmada" en la clase cancelada. Lo arma BE-7.1. */
export interface MiembroAfectado {
  miembroId: string;
  /** true si la reserva usaba un Set de clases mensual (el crédito se devuelve). */
  devolvioCredito: boolean;
}

export interface ResultadoAvisoCancelacion extends ResultadoEnvio {
  /** Grupos de destinatarios que no se pudieron avisar (quedan en el log). */
  fallidos: number;
}

/** Una por clase: repetir el envío de la misma cancelación no duplica avisos. */
export const referenciaCancelacion = (claseId: string) =>
  `clase-${claseId}-cancelada`;

const FORMATO_FECHA = new Intl.DateTimeFormat('es-SV', {
  timeZone: ZONA_HORARIA,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const FORMATO_HORA = new Intl.DateTimeFormat('es-SV', {
  timeZone: ZONA_HORARIA,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const CREDITO_DEVUELTO = ' Tu crédito fue devuelto.';

/**
 * Título y mensaje del criterio 2 de H25. Las fechas y horas van en hora de
 * El Salvador. Si el motivo trae punto final se le quita, para no dejar "..".
 * Si el mensaje pasara de 500 caracteres, se recorta el motivo con "…".
 */
export function avisoCancelacion(
  clase: Pick<ClaseDelAviso, 'tipo' | 'entrenador' | 'inicio' | 'fin'>,
  motivo: string,
  devolvioCredito: boolean,
): { titulo: string; mensaje: string } {
  const antes =
    `La clase de ${clase.tipo} del ${FORMATO_FECHA.format(clase.inicio)} ` +
    `de ${FORMATO_HORA.format(clase.inicio)} a ${FORMATO_HORA.format(clase.fin)} ` +
    `con ${clase.entrenador} fue cancelada por el gimnasio. Motivo: `;
  const despues =
    '. Tu reserva quedó cancelada.' + (devolvioCredito ? CREDITO_DEVUELTO : '');

  let texto = motivo.trim().replace(/\.+$/, '');
  const espacio = MAX_MENSAJE - antes.length - despues.length;
  if (texto.length > espacio) texto = `${texto.slice(0, espacio - 1)}…`;

  return {
    titulo: `Clase cancelada: ${clase.tipo}`.slice(0, MAX_TITULO),
    mensaje: `${antes}${texto}${despues}`,
  };
}

/**
 * Aviso de cancelación de clase reservada (H25, BE-25.1).
 *
 * Uso desde BE-7.1, DESPUÉS de confirmar la transacción de la cancelación:
 *
 *   await this.avisosClase.avisarCancelacion(claseId, afectados, motivo);
 *
 * `afectados` son los miembros que tenían una reserva CONFIRMADA (los que la
 * cancelaron ellos mismos no van). Nunca lanza: si el envío falla, la
 * cancelación no se revierte y el error queda en el log.
 */
@Injectable()
export class AvisosClaseService {
  private readonly logger = new Logger(AvisosClaseService.name);

  constructor(
    private readonly repo: AvisoClaseRepository,
    private readonly avisos: AvisosService,
  ) {}

  /**
   * @param motivo el motivo que guardó BE-7.1 (10 a 250 caracteres).
   */
  async avisarCancelacion(
    claseId: string,
    miembrosAfectados: MiembroAfectado[],
    motivo: string,
  ): Promise<ResultadoAvisoCancelacion> {
    const resultado: ResultadoAvisoCancelacion = {
      creados: 0,
      omitidosPorDuplicado: 0,
      fallidos: 0,
    };
    if (miembrosAfectados.length === 0) return resultado;

    const clase = await this.repo.findClase(claseId);
    if (!clase) {
      this.logger.error(
        `No se pudo avisar la cancelación: la clase ${claseId} no existe.`,
      );
      resultado.fallidos++;
      return resultado;
    }

    // Una llamada por texto: con crédito devuelto y sin él.
    for (const devolvioCredito of [false, true]) {
      const destinatarios = miembrosAfectados
        .filter((m) => m.devolvioCredito === devolvioCredito)
        .map((m) => m.miembroId);
      if (destinatarios.length === 0) continue;
      try {
        const { creados, omitidosPorDuplicado } = await this.avisos.enviar({
          destinatarios,
          ...avisoCancelacion(clase, motivo, devolvioCredito),
          moduloOrigen: ModuloOrigen.CLASES,
          referencia: referenciaCancelacion(claseId),
        });
        resultado.creados += creados;
        resultado.omitidosPorDuplicado += omitidosPorDuplicado;
      } catch (error) {
        resultado.fallidos++;
        this.logger.error(
          `No se pudo avisar la cancelación de la clase ${claseId} ` +
            `(${destinatarios.length} miembro(s)); la cancelación sigue en pie.`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    this.logger.log(
      `Avisos de cancelación de la clase ${claseId}: ${resultado.creados} creado(s), ` +
        `${resultado.omitidosPorDuplicado} omitido(s) por duplicado.`,
    );
    return resultado;
  }
}
