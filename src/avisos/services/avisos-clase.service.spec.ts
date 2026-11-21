import { BadRequestException, Logger } from '@nestjs/common';
import type { MockInstance } from 'vitest';
import type { AvisoClaseRepository, ClaseDelAviso } from '@Avisos/repositories';
import { ModuloOrigen } from '@PrismaClient';
import type { AvisosService } from './avisos.service.js';
import {
  AvisosClaseService,
  avisoCancelacion,
  referenciaCancelacion,
} from './avisos-clase.service.js';

const CLASE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
// Sábado 21/11/2026 de 18:00 a 19:00 en El Salvador (UTC-6).
const CLASE: ClaseDelAviso = {
  id: CLASE_ID,
  tipo: 'Yoga',
  entrenador: 'Ana López',
  inicio: new Date('2026-11-22T00:00:00.000Z'),
  fin: new Date('2026-11-22T01:00:00.000Z'),
};
const MOTIVO = 'Mantenimiento del salón';
const SIN_CREDITO =
  'La clase de Yoga del 21/11/2026 de 18:00 a 19:00 con Ana López fue ' +
  'cancelada por el gimnasio. Motivo: Mantenimiento del salón. Tu reserva ' +
  'quedó cancelada.';
const CON_CREDITO = `${SIN_CREDITO} Tu crédito fue devuelto.`;

describe('avisoCancelacion', () => {
  it('arma el título y el mensaje del criterio 2', () => {
    expect(avisoCancelacion(CLASE, MOTIVO, false)).toEqual({
      titulo: 'Clase cancelada: Yoga',
      mensaje: SIN_CREDITO,
    });
  });

  it('en un Set de clases agrega "Tu crédito fue devuelto."', () => {
    expect(avisoCancelacion(CLASE, MOTIVO, true).mensaje).toBe(CON_CREDITO);
  });

  it('no deja doble punto si el motivo termina en punto', () => {
    expect(avisoCancelacion(CLASE, `  ${MOTIVO}.  `, false).mensaje).toBe(
      SIN_CREDITO,
    );
  });

  it('con los textos más largos posibles no pasa de 500 caracteres', () => {
    const { mensaje } = avisoCancelacion(
      {
        ...CLASE,
        tipo: 'T'.repeat(40),
        entrenador: `${'N'.repeat(50)} ${'A'.repeat(50)}`,
      },
      'M'.repeat(250),
      true,
    );

    expect(mensaje.length).toBeLessThanOrEqual(500);
    expect(mensaje).toMatch(
      /…\. Tu reserva quedó cancelada\. Tu crédito fue devuelto\.$/,
    );
  });
});

describe('AvisosClaseService', () => {
  const repo = { findClase: vi.fn() };
  const avisos = { enviar: vi.fn() };
  const service = new AvisosClaseService(
    repo as unknown as AvisoClaseRepository,
    avisos as unknown as AvisosService,
  );
  let log: MockInstance;
  let error: MockInstance;

  beforeEach(() => {
    vi.resetAllMocks();
    repo.findClase.mockResolvedValue(CLASE);
    avisos.enviar.mockImplementation(
      ({ destinatarios }: { destinatarios: string[] }) =>
        Promise.resolve({
          creados: destinatarios.length,
          omitidosPorDuplicado: 0,
        }),
    );
    log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    error = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('agrupa en una llamada por texto: sin crédito y con crédito devuelto', async () => {
    const resultado = await service.avisarCancelacion(
      CLASE_ID,
      [
        { miembroId: 'm-mensual', devolvioCredito: false },
        { miembroId: 'm-set', devolvioCredito: true },
        { miembroId: 'm-mensual-2', devolvioCredito: false },
      ],
      MOTIVO,
    );

    expect(resultado).toEqual({
      creados: 3,
      omitidosPorDuplicado: 0,
      fallidos: 0,
    });
    expect(avisos.enviar).toHaveBeenCalledTimes(2);
    expect(avisos.enviar).toHaveBeenCalledWith({
      destinatarios: ['m-mensual', 'm-mensual-2'],
      titulo: 'Clase cancelada: Yoga',
      mensaje: SIN_CREDITO,
      moduloOrigen: ModuloOrigen.CLASES,
      referencia: `clase-${CLASE_ID}-cancelada`,
    });
    expect(avisos.enviar).toHaveBeenCalledWith({
      destinatarios: ['m-set'],
      titulo: 'Clase cancelada: Yoga',
      mensaje: CON_CREDITO,
      moduloOrigen: ModuloOrigen.CLASES,
      referencia: referenciaCancelacion(CLASE_ID),
    });
    expect(log).toHaveBeenCalledWith(
      `Avisos de cancelación de la clase ${CLASE_ID}: 3 creado(s), 0 omitido(s) por duplicado.`,
    );
  });

  it('si todos tienen el mismo texto hace una sola llamada', async () => {
    await service.avisarCancelacion(
      CLASE_ID,
      [
        { miembroId: 'm-1', devolvioCredito: true },
        { miembroId: 'm-2', devolvioCredito: true },
      ],
      MOTIVO,
    );

    expect(avisos.enviar).toHaveBeenCalledTimes(1);
  });

  it('sin miembros afectados no consulta ni avisa', async () => {
    const resultado = await service.avisarCancelacion(CLASE_ID, [], MOTIVO);

    expect(resultado).toEqual({
      creados: 0,
      omitidosPorDuplicado: 0,
      fallidos: 0,
    });
    expect(repo.findClase).not.toHaveBeenCalled();
    expect(avisos.enviar).not.toHaveBeenCalled();
  });

  it('repetir el envío suma omitidos (la referencia evita duplicados)', async () => {
    avisos.enviar.mockResolvedValue({ creados: 0, omitidosPorDuplicado: 1 });

    const resultado = await service.avisarCancelacion(
      CLASE_ID,
      [{ miembroId: 'm-1', devolvioCredito: false }],
      MOTIVO,
    );

    expect(resultado).toEqual({
      creados: 0,
      omitidosPorDuplicado: 1,
      fallidos: 0,
    });
  });

  it('nunca lanza: si un grupo falla, avisa al otro y deja el error en el log', async () => {
    avisos.enviar
      .mockRejectedValueOnce(new BadRequestException(['fallo simulado']))
      .mockResolvedValueOnce({ creados: 1, omitidosPorDuplicado: 0 });

    const resultado = await service.avisarCancelacion(
      CLASE_ID,
      [
        { miembroId: 'm-mensual', devolvioCredito: false },
        { miembroId: 'm-set', devolvioCredito: true },
      ],
      MOTIVO,
    );

    expect(resultado).toEqual({
      creados: 1,
      omitidosPorDuplicado: 0,
      fallidos: 1,
    });
    expect(error).toHaveBeenCalled();
  });

  it('si la clase no existe no lanza y lo deja en el log', async () => {
    repo.findClase.mockResolvedValue(null);

    const resultado = await service.avisarCancelacion(
      CLASE_ID,
      [{ miembroId: 'm-1', devolvioCredito: false }],
      MOTIVO,
    );

    expect(resultado.fallidos).toBe(1);
    expect(avisos.enviar).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });
});
