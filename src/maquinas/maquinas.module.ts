import { Module } from '@nestjs/common';
import { MaquinasController } from '@Maquinas/controllers';
import { MaquinasService } from '@Maquinas/services';
import { MaquinaRepository } from '@Maquinas/repositories';

/**
 * Inventario y estado de las máquinas (H17). Exporta el servicio y el
 * repositorio porque H18 los reutiliza para el cambio de estado y el historial.
 */
@Module({
    controllers: [MaquinasController],
    providers: [MaquinasService, MaquinaRepository],
    exports: [MaquinasService, MaquinaRepository],
})
export class MaquinasModule {}
