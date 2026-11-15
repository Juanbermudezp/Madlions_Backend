import { Module } from '@nestjs/common';
import { CobrosModule } from '@Cobros';
import { PlanesModule } from '@Planes';
import { MembresiasController } from '@Membresias/controllers';
import { MembresiaRepository } from '@Membresias/repositories';
import {
    EstadoMembresiaService,
    MembresiasService,
    RegistroMembresiaService,
} from '@Membresias/services';

/**
 * Membresías de los miembros (H2). Registra compras y renovaciones (con el
 * cobro del Módulo 5), exporta MembresiasService.aplicarPago() para que el
 * Módulo 5 active la membresía al aprobarse el pago, y EstadoMembresiaService para que la búsqueda
 * de miembros (H2), la consulta del miembro (H3) y el control de acceso (H10)
 * obtengan el estado de un solo lugar.
 */
@Module({
    imports: [PlanesModule, CobrosModule],
    controllers: [MembresiasController],
    providers: [MembresiaRepository, EstadoMembresiaService, RegistroMembresiaService, MembresiasService],
    exports: [MembresiaRepository, EstadoMembresiaService, MembresiasService],
})
export class MembresiasModule {}
