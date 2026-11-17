import { Injectable } from '@nestjs/common';
import { EstadoMembresiaService } from '@Membresias/services';
import { MiembroRepository } from '@Miembros/repositories';
import type { MiembroBusquedaResponseDto } from '@Miembros/dto';
import { Rol } from '@PrismaClient';
import { escaparLike, normalizarBusqueda } from './normalizar-busqueda.js';

/** Miembros del gimnasio. */
@Injectable()
export class MiembrosService {
    constructor(
        private readonly miembroRepository: MiembroRepository,
        private readonly estadoMembresiaService: EstadoMembresiaService,
    ) { }

    /**
     * Búsqueda de miembros (BE-2.2). El ENTRENADOR solo recibe id, nombre,
     * apellido y código; recepción y administración, también el documento y
     * el estado de la membresía.
     */
    async buscar(q: string, rol: Rol): Promise<MiembroBusquedaResponseDto[]> {
        const exacto = q.trim();
        const encontrados = await this.miembroRepository.buscar(
            escaparLike(normalizarBusqueda(exacto)),
            exacto,
        );

        if (rol === Rol.ENTRENADOR) {
            return encontrados.map(({ id, nombre, apellido, codigo }) => ({ id, nombre, apellido, codigo }));
        }

        const estados = await this.estadoMembresiaService.estadosDe(encontrados.map((m) => m.id));
        return encontrados.map((m) => {
            const resumen = estados.get(m.id);
            return {
                ...m,
                estadoMembresia: resumen?.estado ?? 'SIN_MEMBRESIA',
                fechaVencimiento: resumen?.fechaVencimiento ?? null,
            };
        });
    }
}
