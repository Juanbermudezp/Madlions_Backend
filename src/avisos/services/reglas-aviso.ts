import { ModuloOrigen } from '@PrismaClient';

export const MAX_DESTINATARIOS = 500;
export const MAX_TITULO = 100;
export const MAX_MENSAJE = 500;
export const MAX_REFERENCIA = 100;

/** Contrato de AvisosService.enviar() (H22). */
export interface NuevoAviso {
  /** Ids de ficha de miembro (UUID), de 1 a 500. */
  destinatarios: string[];
  /** De 1 a 100 caracteres. */
  titulo: string;
  /** De 1 a 500 caracteres. */
  mensaje: string;
  /** MEMBRESIAS, CLASES, SESIONES o PAGOS. */
  moduloOrigen: ModuloOrigen;
  /**
   * Opcional, hasta 100 caracteres, con formato <entidad>-<id>-<evento>,
   * por ejemplo "clase-42-cancelada". Evita repetir el mismo aviso.
   */
  referencia?: string;
}

const MODULOS_VALIDOS: readonly string[] = Object.values(ModuloOrigen);
const FORMATO_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORMATO_REFERENCIA = /^[a-z]+-[A-Za-z0-9-]+-[a-z]+$/;

/**
 * Revisa el contrato completo y devuelve todos los problemas encontrados.
 * Una lista vacía significa que el aviso es válido.
 */
export function validarNuevoAviso(aviso: NuevoAviso): string[] {
  const problemas: string[] = [];
  const { destinatarios, titulo, mensaje, moduloOrigen, referencia } = aviso;

  if (!Array.isArray(destinatarios)) {
    problemas.push('destinatarios debe ser una lista de ids de miembro.');
  } else {
    const unicos = normalizarDestinatarios(destinatarios);
    if (unicos.length < 1 || unicos.length > MAX_DESTINATARIOS) {
      problemas.push(
        `destinatarios debe tener de 1 a ${MAX_DESTINATARIOS} ids de miembro.`,
      );
    }
    const invalidos = destinatarios.filter(
      (id) => typeof id !== 'string' || !FORMATO_UUID.test(id),
    );
    if (invalidos.length > 0) {
      problemas.push(
        `destinatarios con formato inválido: ${invalidos.map(String).join(', ')}.`,
      );
    }
  }

  if (!esTextoValido(titulo, MAX_TITULO)) {
    problemas.push(`titulo debe tener de 1 a ${MAX_TITULO} caracteres.`);
  }

  if (!esTextoValido(mensaje, MAX_MENSAJE)) {
    problemas.push(`mensaje debe tener de 1 a ${MAX_MENSAJE} caracteres.`);
  }

  if (!MODULOS_VALIDOS.includes(moduloOrigen)) {
    problemas.push(
      `moduloOrigen no es válido; usa ${MODULOS_VALIDOS.join(', ')}.`,
    );
  }

  if (referencia !== undefined) {
    if (!esTextoValido(referencia, MAX_REFERENCIA)) {
      problemas.push(
        `referencia debe tener de 1 a ${MAX_REFERENCIA} caracteres.`,
      );
    } else if (!FORMATO_REFERENCIA.test(referencia)) {
      problemas.push(
        'referencia debe tener el formato <entidad>-<id>-<evento>, por ejemplo clase-42-cancelada.',
      );
    }
  }

  return problemas;
}

/**
 * Quita repetidos y pasa a minúsculas, porque PostgreSQL considera iguales
 * dos UUID que solo difieren en mayúsculas.
 */
export function normalizarDestinatarios(destinatarios: string[]): string[] {
  return [
    ...new Set(
      destinatarios
        .filter((id) => typeof id === 'string')
        .map((id) => id.toLowerCase()),
    ),
  ];
}

/**
 * Cuenta caracteres como PostgreSQL (por código Unicode, no por unidad
 * UTF-16) y no acepta textos vacíos ni de solo espacios.
 */
function esTextoValido(valor: unknown, maximo: number): boolean {
  return (
    typeof valor === 'string' &&
    valor.trim().length > 0 &&
    Array.from(valor).length <= maximo
  );
}
