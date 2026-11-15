import { Module } from '@nestjs/common';
import { MembresiaRepository } from '@Membresias/repositories';
import { EstadoMembresiaService } from '@Membresias/services';

/**
 * Membresías de los miembros (H2). Exporta EstadoMembresiaService para que la
 * búsqueda de miembros (H2), la consulta del miembro (H3) y el control de
 * acceso (H10) obtengan el estado de un solo lugar.
 */
@Module({
    providers: [MembresiaRepository, EstadoMembresiaService],
    exports: [MembresiaRepository, EstadoMembresiaService],
})
export class MembresiasModule {}
