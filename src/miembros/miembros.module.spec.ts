import { Test } from '@nestjs/testing';
import { PrismaService } from '@Prisma/services';
import { MiembrosModule } from './miembros.module.js';
import { MiembroProgresoService } from './services/miembro-progreso.service.js';

describe('MiembrosModule BE-14.2', () => {
  it('resuelve los servicios compartidos por DI sin inicializar PostgreSQL', async () => {
    const module = await Test.createTestingModule({ imports: [MiembrosModule] })
      .overrideProvider(PrismaService).useValue({}).compile();
    try {
      expect(module.get(MiembroProgresoService)).toBeInstanceOf(MiembroProgresoService);
    } finally { await module.close(); }
  });
});
