import { Injectable } from '@nestjs/common';
import { hoyLocal } from '@Common/fechas';
import { MembresiaRepository } from '@Membresias/repositories';
import { calcularEstadoMembresia, type EstadoMembresiaDetalle } from './reglas-estado.js';

/**
 * Estado de la membresía de los miembros (BE-2.4). Es la fuente única del
 * estado para los módulos 2, 3, 4 y 9; no depende de ningún controlador.
 * Las reglas viven en reglas-estado.ts.
 */
@Injectable()
export class EstadoMembresiaService {
    constructor(private readonly membresiaRepository: MembresiaRepository) { }

    /** Estado de un miembro. `fecha` en AAAA-MM-DD, hora de El Salvador (por defecto, hoy). */
    async obtenerEstado(miembroId: string, fecha: string = hoyLocal()): Promise<EstadoMembresiaDetalle> {
        const estados = await this.estadosDe([miembroId], fecha);
        return estados.get(miembroId)!;
    }

    /**
     * Estado de varios miembros con dos consultas en total (membresías y
     * reservas), para listados como la búsqueda de miembros.
     */
    async estadosDe(
        miembroIds: string[],
        fecha: string = hoyLocal(),
    ): Promise<Map<string, EstadoMembresiaDetalle>> {
        const membresias = await this.membresiaRepository.findParaEstado(miembroIds);
        const reservas = await this.membresiaRepository.contarReservasConfirmadas(
            membresias.filter((m) => m.cantidadClases !== null).map((m) => m.id),
        );
        return new Map(
            miembroIds.map((id) => [
                id,
                calcularEstadoMembresia(
                    membresias.filter((m) => m.miembroId === id),
                    fecha,
                    reservas,
                ),
            ]),
        );
    }
}
