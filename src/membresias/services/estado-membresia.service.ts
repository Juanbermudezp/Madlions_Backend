import { Injectable } from '@nestjs/common';
import { hoyLocal } from '@Common/fechas';
import { MembresiaRepository } from '@Membresias/repositories';
import { calcularEstadoMembresia, type ResumenMembresia } from './reglas-estado.js';

/**
 * Estado de la membresía de los miembros (BE-2.4). Es la fuente única del
 * estado: la búsqueda de miembros, la consulta del miembro (H3) y el control
 * de acceso (H10) lo piden aquí.
 */
@Injectable()
export class EstadoMembresiaService {
    constructor(private readonly membresiaRepository: MembresiaRepository) { }

    /** Estado de cada miembro pedido; los que no tienen membresías salen SIN_MEMBRESIA. */
    async estadosDe(
        miembroIds: string[],
        hoy: string = hoyLocal(),
    ): Promise<Map<string, ResumenMembresia>> {
        const vigencias = await this.membresiaRepository.findVigenciasDe(miembroIds);
        return new Map(
            miembroIds.map((id) => [
                id,
                calcularEstadoMembresia(vigencias.filter((v) => v.miembroId === id), hoy),
            ]),
        );
    }
}
