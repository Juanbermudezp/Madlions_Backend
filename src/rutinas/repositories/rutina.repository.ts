import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { Prisma } from '@PrismaClient';
import type { UpdateRutinaDto } from '../dto/update-rutina.dto.js';

const INCLUIR_RUTINA = {
  miembro: { select: { id: true, codigoMiembro: true, usuario: { select: { nombre: true, apellido: true } } } },
  dias: { orderBy: { orden: 'asc' }, include: { ejercicios: { orderBy: { orden: 'asc' } } } },
} as const satisfies Prisma.RutinaInclude;

export type RutinaCompleta = Prisma.RutinaGetPayload<{ include: typeof INCLUIR_RUTINA }>;
export type DatosRutina = Omit<UpdateRutinaDto, 'fechaInicio'> & { fechaInicio: Date };

function diasParaCrear(dias: DatosRutina['dias']) {
  return dias.map((dia, i) => ({
    nombre: dia.nombre, orden: i + 1,
    ejercicios: { create: dia.ejercicios.map((ejercicio, j) => ({
      nombre: ejercicio.nombre, series: ejercicio.series, repeticiones: ejercicio.repeticiones,
      descansoSeg: ejercicio.descansoSeg, orden: j + 1,
    })) },
  }));
}

@Injectable()
export class RutinaRepository {
  constructor(private readonly prisma: PrismaService) {}

  existeMiembro(id: string) {
    return this.prisma.miembro.findUnique({ where: { id }, select: { id: true } });
  }

  findById(id: string) {
    return this.prisma.rutina.findUnique({ where: { id } });
  }

  listar(entrenadorId: string, miembroId?: string): Promise<RutinaCompleta[]> {
    return this.prisma.rutina.findMany({
      where: { entrenadorId, ...(miembroId ? { miembroId } : {}) },
      orderBy: [{ fechaInicio: 'desc' }, { creadoEn: 'desc' }, { id: 'asc' }],
      include: INCLUIR_RUTINA,
    });
  }

  crear(entrenadorId: string, miembroId: string, datos: DatosRutina): Promise<RutinaCompleta> {
    return this.prisma.$transaction((tx) => tx.rutina.create({
      data: {
        nombre: datos.nombre, objetivo: datos.objetivo, fechaInicio: datos.fechaInicio,
        miembro: { connect: { id: miembroId } }, entrenador: { connect: { id: entrenadorId } },
        dias: { create: diasParaCrear(datos.dias) },
      },
      include: INCLUIR_RUTINA,
    }));
  }

  reemplazar(id: string, entrenadorId: string, datos: DatosRutina): Promise<RutinaCompleta> {
    return this.prisma.$transaction(async (tx) => {
      // La condición de propietario protege también la escritura. Esta primera
      // actualización bloquea la fila padre y serializa reemplazos concurrentes.
      await tx.rutina.update({
        where: { id, entrenadorId },
        data: { nombre: datos.nombre, objetivo: datos.objetivo, fechaInicio: datos.fechaInicio },
      });
      // Los ejercicios anteriores se eliminan por la FK CASCADE de DB-14.1.
      await tx.rutinaDia.deleteMany({ where: { rutinaId: id, rutina: { entrenadorId } } });
      return tx.rutina.update({
        where: { id, entrenadorId },
        data: { dias: { create: diasParaCrear(datos.dias) } },
        include: INCLUIR_RUTINA,
      });
    });
  }
}
