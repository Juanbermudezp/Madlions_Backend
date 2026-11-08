import { BadRequestException, Injectable } from '@nestjs/common';
import { AvisoRepository } from '@Avisos/repositories';
import { MiembrosInexistentesError } from '@Avisos/errors';
import {
  normalizarDestinatarios,
  validarNuevoAviso,
  type NuevoAviso,
} from './reglas-aviso.js';

export interface ResultadoEnvio {
  creados: number;
  omitidosPorDuplicado: number;
}

/**
 * Servicio interno del Módulo 9 (H22). Los demás módulos lo usan para avisar
 * a uno o varios miembros sin construir su propia lógica de envío.
 *
 * No tiene controlador: no existe ningún endpoint para crear avisos.
 *
 * Uso: importar AvisosModule en el módulo que avisa, inyectar AvisosService
 * y llamar a enviar() después de confirmar la transacción propia. Si enviar()
 * falla, la operación del módulo no se revierte; solo se registra el error.
 */
@Injectable()
export class AvisosService {
  constructor(private readonly avisoRepository: AvisoRepository) {}

  /**
   * Registra un aviso NO_LEIDO por destinatario.
   *
   * @throws BadRequestException con la lista de problemas si el contrato no
   * se cumple o algún destinatario no es un miembro. En ese caso no se
   * registra ningún aviso de la llamada.
   */
  async enviar(aviso: NuevoAviso): Promise<ResultadoEnvio> {
    const problemas = validarNuevoAviso(aviso);
    if (problemas.length > 0) {
      throw new BadRequestException(problemas);
    }

    const miembroIds = normalizarDestinatarios(aviso.destinatarios);

    try {
      const creados = await this.avisoRepository.crearParaMiembros({
        miembroIds,
        titulo: aviso.titulo,
        mensaje: aviso.mensaje,
        moduloOrigen: aviso.moduloOrigen,
        referencia: aviso.referencia,
      });
      return { creados, omitidosPorDuplicado: miembroIds.length - creados };
    } catch (error) {
      if (error instanceof MiembrosInexistentesError) {
        throw new BadRequestException([
          error.ids.length > 0
            ? `destinatarios inexistentes: ${error.ids.join(', ')}.`
            : 'Un destinatario dejó de existir durante el envío.',
        ]);
      }
      throw error;
    }
  }
}
