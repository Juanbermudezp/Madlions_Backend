import { Module } from '@nestjs/common';
import { CobrosModule } from '@Cobros';
import { PlanesModule } from '@Planes';
import { MembresiasController } from '@Membresias/controllers';
import { MembresiaRepository } from '@Membresias/repositories';
import { EstadoMembresiaService, RegistroMembresiaService } from '@Membresias/services';

/**
 * Membresías de los miembros (H2). Registra compras y renovaciones (con el
 * cobro del Módulo 5) y exporta EstadoMembresiaService para que la búsqueda
 * de miembros (H2), la consulta del miembro (H3) y el control de acceso (H10)
 * obtengan el estado de un solo lugar.
 */
@Module({
    imports: [PlanesModule, CobrosModule],
    controllers: [MembresiasController],
    providers: [MembresiaRepository, EstadoMembresiaService, RegistroMembresiaService],
    exports: [MembresiaRepository, EstadoMembresiaService],
})
export class MembresiasModule {}
