import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { Prisma, type RegistroProgreso, type TipoProgreso } from '@PrismaClient';
import { MedicionDuplicadaError } from '../errors/medicion-duplicada.error.js';
import type { MedicionNormalizada } from '../services/reglas-progreso.js';

export interface FiltrosProgreso {
  tipo?: TipoProgreso;
  desde?: Date;
  hasta?: Date;
}
export interface ActualizarRegistroData {
  fecha: Date;
  valor: number;
  ejercicio: string | null;
  repeticiones: number | null;
}

@Injectable()
export class ProgresoRepository {
  constructor(private readonly prisma: PrismaService) {}

  async encontrarMiembroId(usuarioId: string): Promise<string | null> {
    const miembro = await this.prisma.miembro.findUnique({
      where: { usuarioId },
      select: { id: true },
    });
    return miembro?.id ?? null;
  }

  findById(id: string): Promise<RegistroProgreso | null> {
    return this.prisma.registroProgreso.findUnique({ where: { id } });
  }

  async crearMultiples(
    miembroId: string,
    fecha: Date,
    mediciones: MedicionNormalizada[],
  ): Promise<RegistroProgreso[]> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const creados: RegistroProgreso[] = [];
        for (const medicion of mediciones) {
          creados.push(await tx.registroProgreso.create({
            data: { miembroId, fecha, ...medicion },
          }));
        }
        return creados;
      });
    } catch (error) {
      this.lanzarSiDuplicado(error);
      throw error;
    }
  }

  async actualizar(id: string, data: ActualizarRegistroData): Promise<RegistroProgreso> {
    try {
      return await this.prisma.registroProgreso.update({
        where: { id },
        data,
      });
    } catch (error) {
      this.lanzarSiDuplicado(error);
      throw error;
    }
  }

  listar(miembroId: string, filtros: FiltrosProgreso): Promise<RegistroProgreso[]> {
    return this.prisma.registroProgreso.findMany({
      where: {
        miembroId,
        ...(filtros.tipo ? { tipo: filtros.tipo } : {}),
        ...((filtros.desde || filtros.hasta)
          ? { fecha: { ...(filtros.desde ? { gte: filtros.desde } : {}), ...(filtros.hasta ? { lte: filtros.hasta } : {}) } }
          : {}),
      },
      orderBy: [{ fecha: 'desc' }, { creadoEn: 'desc' }, { id: 'desc' }],
    });
  }

  private lanzarSiDuplicado(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new MedicionDuplicadaError();
    }
    // El índice único fue añadido con SQL manual; Prisma debería traducirlo
    // como P2002. Cualquier otra excepción se deja intacta.
  }
}
