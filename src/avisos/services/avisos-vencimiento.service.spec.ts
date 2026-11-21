import { BadRequestException, Logger } from '@nestjs/common';
import type { MockInstance } from 'vitest';
import type { AvisoVencimientoRepository } from '@Avisos/repositories';
import { sumarDias } from '@Common/fechas';
import type {
  MembresiaDeMiembro,
  MembresiaRepository,
} from '@Membresias/repositories';
import { EstadoMembresiaService } from '@Membresias/services';
import { EstadoMembresia, ModuloOrigen, TipoPlan } from '@PrismaClient';
import type { AvisosService } from './avisos.service.js';
import type { NuevoAviso } from './reglas-aviso.js';
import {
  AvisosVencimientoService,
  CRON_AVISOS_VENCIMIENTO,
  TITULO_VENCIMIENTO,
  mensajeVencimiento,
  referenciaVencimiento,
} from './avisos-vencimiento.service.js';

// 20/11/2026 a las 06:00 en El Salvador (UTC-6) = 12:00 UTC.
const HOY = '2026-11-20';
const A_LAS_6 = new Date('2026-11-20T12:00:00.000Z');
/** El mismo reloj, `n` días después. */
const diaSiguiente = (n: number) =>
  new Date(A_LAS_6.getTime() + n * 24 * 60 * 60 * 1000);
const columna = (fecha: string) => new Date(`${fecha}T00:00:00.000Z`);

let secuencia = 0;

/** Membresía PAGADA que vence dentro de `diasParaVencer` días (respecto a HOY). */
function pagada(
  miembroId: string,
  diasParaVencer: number,
  datos: Partial<MembresiaDeMiembro> = {},
): MembresiaDeMiembro {
  const vencimiento = sumarDias(HOY, diasParaVencer);
  const tipoPlan = datos.tipoPlan ?? TipoPlan.MENSUAL;
  const inicio =
    tipoPlan === TipoPlan.DAYPASS ? vencimiento : sumarDias(vencimiento, -29);
  secuencia++;
  return {
    id: `membresia${secuencia}`,
    miembroId,
    estado: EstadoMembresia.PAGADA,
    nombrePlan: 'Mensual Full',
    tipoPlan,
    cantidadClases: null,
    fechaInicioSolicitada: columna(inicio),
    fechaInicio: columna(inicio),
    fechaVencimiento: columna(vencimiento),
    tiposClaseIds: [],
    ...datos,
  };
}

describe('AvisosVencimientoService', () => {
  /** Tabla `membresia` simulada. */
  let membresias: MembresiaDeMiembro[];
  /** Reservas CONFIRMADA por membresía. */
  let reservas: Map<string, number>;
  /** Avisos guardados, por referencia (la restricción única de H22). */
  let avisos: Map<string, NuevoAviso>;
  let falla: Set<string>;

  const repo = {
    miembrosConVencimientoEntre: vi.fn((desde: string, hasta: string) => {
      const ids = membresias
        .filter(
          (m) =>
            m.estado === EstadoMembresia.PAGADA &&
            m.tipoPlan !== TipoPlan.DAYPASS &&
            m.fechaVencimiento !== null &&
            m.fechaVencimiento >= columna(desde) &&
            m.fechaVencimiento <= columna(hasta),
        )
        .map((m) => m.miembroId);
      return Promise.resolve([...new Set(ids)]);
    }),
  };
  const membresiaRepository = {
    findParaEstado: (ids: string[]) =>
      Promise.resolve(membresias.filter((m) => ids.includes(m.miembroId))),
    contarReservasConfirmadas: (ids: string[]) =>
      Promise.resolve(new Map(ids.map((id) => [id, reservas.get(id) ?? 0]))),
  };
  const avisosService = {
    enviar: vi.fn((input: NuevoAviso) => {
      if (falla.has(input.destinatarios[0])) {
        return Promise.reject(new BadRequestException(['fallo simulado']));
      }
      if (avisos.has(input.referencia!)) {
        return Promise.resolve({ creados: 0, omitidosPorDuplicado: 1 });
      }
      avisos.set(input.referencia!, input);
      return Promise.resolve({ creados: 1, omitidosPorDuplicado: 0 });
    }),
  };

  const service = new AvisosVencimientoService(
    repo as unknown as AvisoVencimientoRepository,
    new EstadoMembresiaService(
      membresiaRepository as unknown as MembresiaRepository,
    ),
    avisosService as unknown as AvisosService,
  );

  let log: MockInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    membresias = [];
    reservas = new Map();
    avisos = new Map();
    falla = new Set();
    // Reloj simulado: solo Date; las promesas funcionan normal.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(A_LAS_6);
    log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('está programada todos los días a las 06:00 en hora de El Salvador', () => {
    expect(CRON_AVISOS_VENCIMIENTO).toBe('0 6 * * *');
    expect(
      Reflect.getMetadata(
        'SCHEDULE_CRON_OPTIONS',
        // Solo se lee la metadata del método; no se llama.
        // oxlint-disable-next-line typescript/unbound-method
        AvisosVencimientoService.prototype.ejecutar,
      ),
    ).toMatchObject({ cronTime: '0 6 * * *', timeZone: 'America/El_Salvador' });
  });

  it('consulta las membresías que vencen entre hoy y hoy + 3', async () => {
    await service.ejecutar();

    expect(repo.miembrosConVencimientoEntre).toHaveBeenCalledWith(
      HOY,
      '2026-11-23',
    );
  });

  it('avisa a 3 días y a 0 días, pero no a 4 días', async () => {
    const a3 = pagada('m-3', 3);
    const a0 = pagada('m-0', 0);
    membresias = [pagada('m-4', 4), a3, a0];

    const resultado = await service.ejecutar();

    expect(resultado).toMatchObject({
      dia: HOY,
      creados: 2,
      omitidosPorDuplicado: 0,
    });
    expect([...avisos.keys()].sort()).toEqual(
      [referenciaVencimiento(a3.id), referenciaVencimiento(a0.id)].sort(),
    );
    expect(avisos.get(referenciaVencimiento(a3.id))).toEqual({
      destinatarios: ['m-3'],
      titulo: TITULO_VENCIMIENTO,
      mensaje:
        'Tu plan Mensual Full vence el 23/11/2026. Desde esa fecha puedes pagar ' +
        'tu renovación; acércate a recepción para registrarla.',
      moduloOrigen: ModuloOrigen.MEMBRESIAS,
      referencia: `membresia-${a3.id}-vence`,
    });
  });

  it('en un Set de clases agrega las clases que le quedan', async () => {
    const set = pagada('m-set', 1, {
      nombrePlan: 'Set 8 clases',
      tipoPlan: TipoPlan.SET_CLASES,
      cantidadClases: 8,
    });
    membresias = [set];
    reservas.set(set.id, 3);

    await service.ejecutar();

    expect(avisos.get(referenciaVencimiento(set.id))?.mensaje).toBe(
      'Tu plan Set 8 clases vence el 21/11/2026. Desde esa fecha puedes pagar ' +
        'tu renovación; acércate a recepción para registrarla. ' +
        'Te quedan 5 clases por usar.',
    );
  });

  it('no avisa un Daypass', async () => {
    membresias = [
      pagada('m-day', 0, { tipoPlan: TipoPlan.DAYPASS, nombrePlan: 'Daypass' }),
    ];

    const resultado = await service.ejecutar();

    expect(resultado.creados).toBe(0);
    expect(avisosService.enviar).not.toHaveBeenCalled();
  });

  it('no avisa si la renovación ya está pagada (Por iniciar)', async () => {
    const actual = pagada('m-ren', 2);
    const renovacion = pagada('m-ren', 32, {
      fechaInicio: columna(sumarDias(HOY, 3)),
      fechaInicioSolicitada: columna(sumarDias(HOY, 3)),
    });
    membresias = [actual, renovacion];

    const resultado = await service.ejecutar();

    expect(resultado.creados).toBe(0);
    expect(avisosService.enviar).not.toHaveBeenCalled();
  });

  it('sí avisa si la renovación está registrada pero sin pagar', async () => {
    const actual = pagada('m-pend', 2);
    membresias = [
      actual,
      {
        ...pagada('m-pend', 32),
        estado: EstadoMembresia.PENDIENTE_PAGO,
        fechaInicio: null,
        fechaVencimiento: null,
        fechaInicioSolicitada: columna(sumarDias(HOY, 3)),
      },
    ];

    await service.ejecutar();

    expect(avisos.has(referenciaVencimiento(actual.id))).toBe(true);
  });

  it('correrla dos veces el mismo día no duplica el aviso', async () => {
    membresias = [pagada('m-doble', 2)];

    const primera = await service.ejecutar();
    const segunda = await service.ejecutar();

    expect(primera).toMatchObject({ creados: 1, omitidosPorDuplicado: 0 });
    expect(segunda).toMatchObject({ creados: 0, omitidosPorDuplicado: 1 });
    expect(avisos.size).toBe(1);
    expect(log).toHaveBeenLastCalledWith(
      `Avisos de vencimiento del ${HOY}: 0 creado(s), 1 omitido(s) por duplicado.`,
    );
  });

  it('si un día no corre, al siguiente avisa a las que siguen dentro de los 3 días', async () => {
    const avisadaAyer = pagada('m-ayer', 3); // vence el 23
    const nueva = pagada('m-nueva', 4); // vence el 24: entra el 21
    const yaVencida = pagada('m-vencida', 0); // vence el 20: el 22 ya no
    membresias = [avisadaAyer, nueva, yaVencida];

    // Día 20: avisa a la del 23 y a la del 20.
    await service.avisarVencimientos(A_LAS_6);
    expect(avisos.size).toBe(2);

    // El día 21 no corrió. Día 22: la del 24 recibe su aviso, la del 23 no se repite.
    const resultado = await service.avisarVencimientos(diaSiguiente(2));

    expect(resultado).toMatchObject({
      dia: '2026-11-22',
      creados: 1,
      omitidosPorDuplicado: 1,
    });
    expect(avisos.has(referenciaVencimiento(nueva.id))).toBe(true);
  });

  it('si el aviso de un miembro falla, sigue con los demás y lo registra', async () => {
    membresias = [pagada('m-falla', 1), pagada('m-bien', 1)];
    falla.add('m-falla');

    const resultado = await service.ejecutar();

    expect(resultado).toMatchObject({ creados: 1, fallidos: 1 });
    expect(log).toHaveBeenCalledWith(
      `Avisos de vencimiento del ${HOY}: 1 creado(s), 0 omitido(s) por duplicado, 1 con error.`,
    );
  });

  it('registra en el log cuántos creó y cuántos omitió', async () => {
    membresias = [pagada('m-a', 1), pagada('m-b', 2)];

    await service.ejecutar();

    expect(log).toHaveBeenCalledWith(
      `Avisos de vencimiento del ${HOY}: 2 creado(s), 0 omitido(s) por duplicado.`,
    );
  });
});

describe('mensajeVencimiento', () => {
  it('sin créditos no agrega la frase de clases', () => {
    expect(
      mensajeVencimiento({
        plan: 'Mensual',
        fechaVencimiento: '2026-12-01',
        creditosDisponibles: null,
      }),
    ).toBe(
      'Tu plan Mensual vence el 01/12/2026. Desde esa fecha puedes pagar tu ' +
        'renovación; acércate a recepción para registrarla.',
    );
  });
});
