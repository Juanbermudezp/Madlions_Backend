import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '@Prisma/services';
import { AvisosModule } from './avisos.module.js';
import { AvisosService } from './services/index.js';

/** PrismaModule es global en la app; aquí se reemplaza por un doble. */
@Module({
  providers: [{ provide: PrismaService, useValue: {} }],
  exports: [PrismaService],
})
class PrismaFalsoModule {}

describe('AvisosModule', () => {
  // Compilar un módulo de Nest tarda varios segundos en máquinas lentas o con
  // toda la suite en paralelo: el límite de 5 s de Vitest queda muy justo.
  it('otro módulo puede importarlo e inyectar AvisosService', async () => {
    const ref = await Test.createTestingModule({
      imports: [{ module: PrismaFalsoModule, global: true }, AvisosModule],
    }).compile();

    expect(ref.get(AvisosService)).toBeInstanceOf(AvisosService);
  }, 15000);

  it('no tiene controladores: los avisos no se crean desde la API', () => {
    const controladores: unknown[] =
      Reflect.getMetadata('controllers', AvisosModule) ?? [];
    expect(controladores).toHaveLength(0);
  });
});
