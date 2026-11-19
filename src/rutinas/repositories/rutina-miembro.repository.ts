import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { Prisma } from '@PrismaClient';

const RESUMEN = {
  id: true, nombre: true, objetivo: true, fechaInicio: true,
  entrenador: { select: { id: true, nombre: true, apellido: true } },
} as const satisfies Prisma.RutinaSelect;

const DETALLE = {
  ...RESUMEN,
  dias: { orderBy: { orden: 'asc' }, select: {
    id: true, orden: true, nombre: true,
    ejercicios: { orderBy: { orden: 'asc' }, select: {
      id: true, orden: true, nombre: true, series: true, repeticiones: true, descansoSeg: true,
    } },
  } },
} as const satisfies Prisma.RutinaSelect;

export type ResumenRutinaPropia = Prisma.RutinaGetPayload<{ select: typeof RESUMEN }>;
export type DetalleRutinaPropia = Prisma.RutinaGetPayload<{ select: typeof DETALLE }>;

/** Solo lecturas actuales, sin caché ni acceso a datos privados de usuarios. */
@Injectable()
export class RutinaMiembroRepository {
  constructor(private readonly prisma: PrismaService) {}

  miembroDeUsuario(usuarioId: string) {
    return this.prisma.miembro.findUnique({ where: { usuarioId }, select: { id: true } });
  }

  listarPropias(miembroId: string): Promise<ResumenRutinaPropia[]> {
    return this.prisma.rutina.findMany({
      where: { miembroId }, select: RESUMEN,
      orderBy: [{ fechaInicio: 'desc' }, { creadoEn: 'desc' }, { id: 'asc' }],
    });
  }

  propietario(id: string) {
    return this.prisma.rutina.findUnique({ where: { id }, select: { miembroId: true } });
  }

  detallePropio(id: string, miembroId: string): Promise<DetalleRutinaPropia | null> {
    // Se vuelve a limitar por dueño en la consulta de datos, además de la
    // autorización del servicio. Una desaparición/cambio concurrente no filtra datos.
    return this.prisma.rutina.findFirst({ where: { id, miembroId }, select: DETALLE });
  }
}
