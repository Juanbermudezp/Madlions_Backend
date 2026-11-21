import { Module } from '@nestjs/common';
import { ClasesModule } from '@Clases';
import { PlanesController } from '@Planes/controllers';
import { PlanesService } from '@Planes/services';
import { PlanRepository } from '@Planes/repositories';

/**
 * Administración de planes (H1). Importa ClasesModule para validar los tipos
 * de clase con TipoClaseRepository (H4) sin duplicar su acceso a datos.
 */
@Module({
    imports: [ClasesModule],
    controllers: [PlanesController],
    providers: [PlanesService, PlanRepository],
    exports: [PlanesService, PlanRepository],
})
export class PlanesModule {}
