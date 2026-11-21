import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';

/** Datos de la clase que van en el aviso de cancelación (H25). */
export interface ClaseDelAviso {
  id: string;
  tipo: string;
  entrenador: string;
  inicio: Date;
  fin: Date;
}

/**
 * Lectura de la clase para el aviso de cancelación (H25, BE-25.1). No consulta
 * reservas: los miembros afectados los entrega BE-7.1.
 */
@Injectable()
export class AvisoClaseRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findClase(claseId: string): Promise<ClaseDelAviso | null> {
    const clase = await this.prisma.clase.findUnique({
      where: { id: claseId },
      select: {
        id: true,
        inicio: true,
        fin: true,
        tipoClase: { select: { nombre: true } },
        entrenador: { select: { nombre: true, apellido: true } },
      },
    });
    if (!clase) return null;
    return {
      id: clase.id,
      tipo: clase.tipoClase.nombre,
      entrenador: `${clase.entrenador.nombre} ${clase.entrenador.apellido}`,
      inicio: clase.inicio,
      fin: clase.fin,
    };
  }
}
