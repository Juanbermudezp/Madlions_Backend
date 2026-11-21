import { Module, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { PrismaService } from '@Prisma/services';
import { AvisosModule } from './avisos.module.js';
import { AvisosController } from './controllers/index.js';
import {
  AvisosBandejaService,
  AvisosClaseService,
  AvisosService,
} from './services/index.js';

/** PrismaModule es global en la app; aquí se reemplaza por un doble. */
@Module({
  providers: [{ provide: PrismaService, useValue: {} }],
  exports: [PrismaService],
})
class PrismaFalsoModule {}

/** Método HTTP y ruta de cada handler del controlador. */
function rutas(controlador: object): { metodo: string; ruta: string }[] {
  const prototipo = (controlador as { prototype: Record<string, unknown> })
    .prototype;
  return Object.getOwnPropertyNames(prototipo)
    .filter((nombre) => nombre !== 'constructor')
    .map((nombre) => prototipo[nombre])
    .filter((handler) => Reflect.hasMetadata(PATH_METADATA, handler as object))
    .map((handler) => ({
      metodo:
        RequestMethod[
          Reflect.getMetadata(METHOD_METADATA, handler as object) as number
        ],
      ruta: String(Reflect.getMetadata(PATH_METADATA, handler as object)),
    }));
}

describe('AvisosModule', () => {
  // Compilar un módulo de Nest tarda varios segundos en máquinas lentas o con
  // toda la suite en paralelo: el límite de 5 s de Vitest queda muy justo.
  it('otro módulo puede importarlo e inyectar AvisosService', async () => {
    const ref = await Test.createTestingModule({
      imports: [{ module: PrismaFalsoModule, global: true }, AvisosModule],
    }).compile();

    expect(ref.get(AvisosService)).toBeInstanceOf(AvisosService);
    expect(ref.get(AvisosBandejaService)).toBeInstanceOf(AvisosBandejaService);
    expect(ref.get(AvisosClaseService)).toBeInstanceOf(AvisosClaseService);
  }, 15000);

  it('exporta AvisosService y AvisosClaseService (H25); la bandeja es interna del módulo', () => {
    expect(Reflect.getMetadata('exports', AvisosModule)).toEqual([
      AvisosService,
      AvisosClaseService,
    ]);
  });

  it('no importa otros módulos, para que ClasesModule lo importe sin ciclos (H25)', () => {
    expect(Reflect.getMetadata('imports', AvisosModule) ?? []).toEqual([]);
  });

  it('la API solo lee y marca como leídos: ninguna ruta crea avisos (H22)', () => {
    expect(rutas(AvisosController)).toEqual([
      { metodo: 'GET', ruta: 'mios' },
      { metodo: 'GET', ruta: 'no-leidos/conteo' },
      { metodo: 'GET', ruta: ':id' },
      { metodo: 'POST', ruta: 'marcar-todos-leidos' },
    ]);
  });
});
