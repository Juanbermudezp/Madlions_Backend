import { BadRequestException } from '@nestjs/common';
import type { AvisoRepository } from '@Avisos/repositories';
import { MiembrosInexistentesError } from '@Avisos/errors';
import { ModuloOrigen } from '@PrismaClient';
import { AvisosService } from './avisos.service.js';
import type { NuevoAviso } from './reglas-aviso.js';

const M1 = '11111111-1111-4111-8111-111111111111';
const M2 = '22222222-2222-4222-8222-222222222222';
const M3 = '33333333-3333-4333-8333-333333333333';

function aviso(datos: Partial<NuevoAviso> = {}): NuevoAviso {
  return {
    destinatarios: [M1, M2, M3],
    titulo: 'Clase cancelada: Yoga',
    mensaje: 'La clase de Yoga fue cancelada por el gimnasio.',
    moduloOrigen: ModuloOrigen.CLASES,
    referencia: 'clase-42-cancelada',
    ...datos,
  };
}

async function problemasDe(promesa: Promise<unknown>): Promise<unknown> {
  const error = await promesa.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(BadRequestException);
  return (error as BadRequestException).getResponse();
}

describe('AvisosService', () => {
  const repo = { crearParaMiembros: vi.fn() };
  const service = new AvisosService(repo as unknown as AvisoRepository);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('enviar', () => {
    it('registra un aviso por destinatario y devuelve cuántos creó', async () => {
      repo.crearParaMiembros.mockResolvedValue(3);

      const resultado = await service.enviar(aviso());

      expect(resultado).toEqual({ creados: 3, omitidosPorDuplicado: 0 });
      expect(repo.crearParaMiembros).toHaveBeenCalledWith({
        miembroIds: [M1, M2, M3],
        titulo: 'Clase cancelada: Yoga',
        mensaje: 'La clase de Yoga fue cancelada por el gimnasio.',
        moduloOrigen: ModuloOrigen.CLASES,
        referencia: 'clase-42-cancelada',
      });
    });

    it('informa cuántos omitió por duplicado', async () => {
      repo.crearParaMiembros.mockResolvedValue(1);

      const resultado = await service.enviar(aviso());

      expect(resultado).toEqual({ creados: 1, omitidosPorDuplicado: 2 });
    });

    it('envía sin referencia cuando no se indica', async () => {
      repo.crearParaMiembros.mockResolvedValue(1);

      await service.enviar(
        aviso({ destinatarios: [M1], referencia: undefined }),
      );

      expect(repo.crearParaMiembros).toHaveBeenCalledWith(
        expect.objectContaining({ miembroIds: [M1], referencia: undefined }),
      );
    });

    it('quita destinatarios repetidos antes de registrar', async () => {
      repo.crearParaMiembros.mockResolvedValue(2);

      const resultado = await service.enviar(
        aviso({ destinatarios: [M1, M2, M1, M2.toUpperCase()] }),
      );

      expect(repo.crearParaMiembros).toHaveBeenCalledWith(
        expect.objectContaining({ miembroIds: [M1, M2] }),
      );
      expect(resultado).toEqual({ creados: 2, omitidosPorDuplicado: 0 });
    });

    it('rechaza un contrato inválido con la lista de problemas y no registra nada', async () => {
      const respuesta = await problemasDe(
        service.enviar(aviso({ destinatarios: [], titulo: '' })),
      );

      expect(respuesta).toMatchObject({
        statusCode: 400,
        message: [
          'destinatarios debe tener de 1 a 500 ids de miembro.',
          'titulo debe tener de 1 a 100 caracteres.',
        ],
      });
      expect(repo.crearParaMiembros).not.toHaveBeenCalled();
    });

    it('rechaza un módulo de origen fuera del enum', async () => {
      const respuesta = await problemasDe(
        service.enviar(
          aviso({ moduloOrigen: 'RESERVAS' as unknown as ModuloOrigen }),
        ),
      );

      expect(respuesta).toMatchObject({
        message: [
          'moduloOrigen no es válido; usa MEMBRESIAS, CLASES, SESIONES, PAGOS.',
        ],
      });
      expect(repo.crearParaMiembros).not.toHaveBeenCalled();
    });

    it('convierte destinatarios inexistentes en un error de validación', async () => {
      repo.crearParaMiembros.mockRejectedValue(
        new MiembrosInexistentesError([M3]),
      );

      const respuesta = await problemasDe(service.enviar(aviso()));

      expect(respuesta).toMatchObject({
        message: [`destinatarios inexistentes: ${M3}.`],
      });
    });

    it('deja pasar los errores inesperados del repositorio', async () => {
      repo.crearParaMiembros.mockRejectedValue(new Error('sin conexión'));

      await expect(service.enviar(aviso())).rejects.toThrow('sin conexión');
    });
  });
});
