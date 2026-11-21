import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AvisoBandejaRepository } from '@Avisos/repositories';
import { EstadoAviso, ModuloOrigen, type Aviso } from '@PrismaClient';
import {
  AVISOS_POR_PAGINA,
  AvisosBandejaService,
  MENSAJES_BANDEJA,
} from './avisos-bandeja.service.js';

const USUARIO = 'u-1';
const MIEMBRO = '11111111-1111-4111-8111-111111111111';
const OTRO_MIEMBRO = '22222222-2222-4222-8222-222222222222';
const AHORA = new Date('2026-11-20T22:00:00.000Z');

function aviso(datos: Partial<Aviso> = {}): Aviso {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    miembroId: MIEMBRO,
    titulo: 'Clase cancelada: Yoga',
    mensaje: 'La clase de Yoga fue cancelada por el gimnasio.',
    moduloOrigen: ModuloOrigen.CLASES,
    referencia: 'clase-42-cancelada',
    estado: EstadoAviso.NO_LEIDO,
    creadoEn: new Date('2026-11-20T21:30:00.000Z'),
    leidoEn: null,
    ...datos,
  };
}

describe('AvisosBandejaService', () => {
  const repo = {
    findMiembroIdDeUsuario: vi.fn(),
    listarDelMiembro: vi.fn(),
    findPorId: vi.fn(),
    marcarLeido: vi.fn(),
    contarNoLeidos: vi.fn(),
    marcarTodosLeidos: vi.fn(),
  };
  const service = new AvisosBandejaService(
    repo as unknown as AvisoBandejaRepository,
  );

  beforeEach(() => {
    vi.resetAllMocks();
    repo.findMiembroIdDeUsuario.mockResolvedValue(MIEMBRO);
  });

  describe('listar', () => {
    it('devuelve la página 1 con todos los avisos por defecto', async () => {
      repo.listarDelMiembro.mockResolvedValue({ avisos: [aviso()], total: 1 });

      const resultado = await service.listar(USUARIO);

      expect(repo.listarDelMiembro).toHaveBeenCalledWith(MIEMBRO, {
        soloNoLeidos: false,
        saltar: 0,
        tomar: AVISOS_POR_PAGINA,
      });
      expect(resultado).toEqual({
        items: [
          {
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            titulo: 'Clase cancelada: Yoga',
            moduloOrigen: ModuloOrigen.CLASES,
            creadoEn: '2026-11-20T21:30:00.000Z',
            estado: EstadoAviso.NO_LEIDO,
          },
        ],
        total: 1,
        pagina: 1,
      });
    });

    it('pagina de 20 en 20 y pasa el filtro de no leídos', async () => {
      repo.listarDelMiembro.mockResolvedValue({ avisos: [], total: 25 });

      const resultado = await service.listar(USUARIO, {
        soloNoLeidos: true,
        pagina: 2,
      });

      expect(repo.listarDelMiembro).toHaveBeenCalledWith(MIEMBRO, {
        soloNoLeidos: true,
        saltar: 20,
        tomar: 20,
      });
      expect(resultado).toMatchObject({ total: 25, pagina: 2 });
    });

    it('un usuario sin ficha de miembro tiene la bandeja vacía', async () => {
      repo.findMiembroIdDeUsuario.mockResolvedValue(null);

      expect(await service.listar(USUARIO)).toEqual({
        items: [],
        total: 0,
        pagina: 1,
      });
      expect(repo.listarDelMiembro).not.toHaveBeenCalled();
    });
  });

  describe('abrir', () => {
    it('devuelve el mensaje y marca como leído un aviso sin leer', async () => {
      repo.findPorId.mockResolvedValue(aviso());
      repo.marcarLeido.mockResolvedValue(
        aviso({ estado: EstadoAviso.LEIDO, leidoEn: AHORA }),
      );

      const detalle = await service.abrir(USUARIO, aviso().id, AHORA);

      expect(repo.marcarLeido).toHaveBeenCalledWith(aviso().id, AHORA);
      expect(detalle).toMatchObject({
        mensaje: 'La clase de Yoga fue cancelada por el gimnasio.',
        estado: EstadoAviso.LEIDO,
        leidoEn: AHORA.toISOString(),
      });
    });

    it('un aviso ya leído se devuelve sin cambiar su fecha de lectura', async () => {
      const leidoAntes = new Date('2026-11-19T10:00:00.000Z');
      repo.findPorId.mockResolvedValue(
        aviso({ estado: EstadoAviso.LEIDO, leidoEn: leidoAntes }),
      );

      const detalle = await service.abrir(USUARIO, aviso().id, AHORA);

      expect(repo.marcarLeido).not.toHaveBeenCalled();
      expect(detalle.leidoEn).toBe(leidoAntes.toISOString());
    });

    it('404 si el aviso no existe', async () => {
      repo.findPorId.mockResolvedValue(null);

      await expect(service.abrir(USUARIO, aviso().id)).rejects.toThrow(
        new NotFoundException(MENSAJES_BANDEJA.noExiste),
      );
    });

    it('403 si el aviso es de otro miembro, sin marcarlo como leído', async () => {
      repo.findPorId.mockResolvedValue(aviso({ miembroId: OTRO_MIEMBRO }));

      await expect(service.abrir(USUARIO, aviso().id)).rejects.toThrow(
        new ForbiddenException(MENSAJES_BANDEJA.ajeno),
      );
      expect(repo.marcarLeido).not.toHaveBeenCalled();
    });

    it('403 si el usuario no tiene ficha de miembro', async () => {
      repo.findPorId.mockResolvedValue(aviso());
      repo.findMiembroIdDeUsuario.mockResolvedValue(null);

      await expect(service.abrir(USUARIO, aviso().id)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('contarNoLeidos', () => {
    it('cuenta solo los avisos sin leer del miembro', async () => {
      repo.contarNoLeidos.mockResolvedValue(3);

      expect(await service.contarNoLeidos(USUARIO)).toEqual({ noLeidos: 3 });
      expect(repo.contarNoLeidos).toHaveBeenCalledWith(MIEMBRO);
    });

    it('0 si el usuario no tiene ficha de miembro', async () => {
      repo.findMiembroIdDeUsuario.mockResolvedValue(null);

      expect(await service.contarNoLeidos(USUARIO)).toEqual({ noLeidos: 0 });
    });
  });

  describe('marcarTodosLeidos', () => {
    it('devuelve cuántos avisos cambió', async () => {
      repo.marcarTodosLeidos.mockResolvedValue(4);

      expect(await service.marcarTodosLeidos(USUARIO, AHORA)).toEqual({
        actualizados: 4,
      });
      expect(repo.marcarTodosLeidos).toHaveBeenCalledWith(MIEMBRO, AHORA);
    });
  });
});
