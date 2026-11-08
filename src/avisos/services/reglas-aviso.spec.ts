import { ModuloOrigen } from '@PrismaClient';
import {
  normalizarDestinatarios,
  validarNuevoAviso,
  type NuevoAviso,
} from './reglas-aviso.js';

const M1 = '11111111-1111-4111-8111-111111111111';
const M2 = '22222222-2222-4222-8222-222222222222';

function aviso(datos: Partial<NuevoAviso> = {}): NuevoAviso {
  return {
    destinatarios: [M1],
    titulo: 'Clase cancelada: Yoga',
    mensaje: 'La clase de Yoga fue cancelada por el gimnasio.',
    moduloOrigen: ModuloOrigen.CLASES,
    ...datos,
  };
}

describe('validarNuevoAviso', () => {
  it('acepta un aviso válido, con y sin referencia', () => {
    expect(validarNuevoAviso(aviso())).toEqual([]);
    expect(
      validarNuevoAviso(aviso({ referencia: `clase-${M2}-cancelada` })),
    ).toEqual([]);
    expect(
      validarNuevoAviso(aviso({ referencia: 'membresia-15-vence' })),
    ).toEqual([]);
  });

  it('acepta los cuatro módulos de origen del enum', () => {
    for (const moduloOrigen of Object.values(ModuloOrigen)) {
      expect(validarNuevoAviso(aviso({ moduloOrigen }))).toEqual([]);
    }
  });

  it('acepta los largos máximos exactos', () => {
    expect(
      validarNuevoAviso(
        aviso({
          titulo: 'a'.repeat(100),
          mensaje: 'a'.repeat(500),
          referencia: `x-${'1'.repeat(96)}-y`,
        }),
      ),
    ).toEqual([]);
  });

  it('rechaza un aviso sin destinatarios', () => {
    expect(validarNuevoAviso(aviso({ destinatarios: [] }))).toEqual([
      'destinatarios debe tener de 1 a 500 ids de miembro.',
    ]);
  });

  it('rechaza más de 500 destinatarios distintos', () => {
    const destinatarios = Array.from(
      { length: 501 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );
    expect(validarNuevoAviso(aviso({ destinatarios }))).toEqual([
      'destinatarios debe tener de 1 a 500 ids de miembro.',
    ]);
  });

  it('cuenta los destinatarios sin repetidos', () => {
    const destinatarios = [...Array.from({ length: 600 }, () => M1), M2];
    expect(validarNuevoAviso(aviso({ destinatarios }))).toEqual([]);
  });

  it('rechaza ids que no son UUID', () => {
    expect(
      validarNuevoAviso(aviso({ destinatarios: [M1, '123', 'abc'] })),
    ).toEqual(['destinatarios con formato inválido: 123, abc.']);
  });

  it('rechaza destinatarios que no son una lista', () => {
    expect(
      validarNuevoAviso(aviso({ destinatarios: M1 as unknown as string[] })),
    ).toEqual(['destinatarios debe ser una lista de ids de miembro.']);
  });

  it.each([
    ['vacío', ''],
    ['de solo espacios', '   '],
    ['de 101 caracteres', 'a'.repeat(101)],
    ['ausente', undefined],
  ])('rechaza un título %s', (_caso, titulo) => {
    expect(
      validarNuevoAviso(aviso({ titulo: titulo as unknown as string })),
    ).toEqual(['titulo debe tener de 1 a 100 caracteres.']);
  });

  it.each([
    ['vacío', ''],
    ['de 501 caracteres', 'a'.repeat(501)],
  ])('rechaza un mensaje %s', (_caso, mensaje) => {
    expect(validarNuevoAviso(aviso({ mensaje }))).toEqual([
      'mensaje debe tener de 1 a 500 caracteres.',
    ]);
  });

  it('cuenta caracteres como PostgreSQL: 100 emojis caben en el título', () => {
    expect(validarNuevoAviso(aviso({ titulo: '🏋'.repeat(100) }))).toEqual([]);
  });

  it('rechaza un módulo de origen fuera del enum', () => {
    expect(
      validarNuevoAviso(
        aviso({ moduloOrigen: 'RESERVAS' as unknown as ModuloOrigen }),
      ),
    ).toEqual([
      'moduloOrigen no es válido; usa MEMBRESIAS, CLASES, SESIONES, PAGOS.',
    ]);
  });

  it.each([
    ['vacía', '', 'referencia debe tener de 1 a 100 caracteres.'],
    [
      'de 101 caracteres',
      `x-${'1'.repeat(97)}-y`,
      'referencia debe tener de 1 a 100 caracteres.',
    ],
    [
      'sin el formato entidad-id-evento',
      'clase cancelada',
      'referencia debe tener el formato <entidad>-<id>-<evento>, por ejemplo clase-42-cancelada.',
    ],
  ])('rechaza una referencia %s', (_caso, referencia, problema) => {
    expect(validarNuevoAviso(aviso({ referencia }))).toEqual([problema]);
  });

  it('devuelve todos los problemas juntos', () => {
    expect(
      validarNuevoAviso({
        destinatarios: [],
        titulo: '',
        mensaje: '',
        moduloOrigen: 'X' as unknown as ModuloOrigen,
      }),
    ).toHaveLength(4);
  });
});

describe('normalizarDestinatarios', () => {
  it('quita repetidos y trata igual mayúsculas y minúsculas', () => {
    expect(normalizarDestinatarios([M1, M2, M1, M1.toUpperCase()])).toEqual([
      M1,
      M2,
    ]);
  });
});
