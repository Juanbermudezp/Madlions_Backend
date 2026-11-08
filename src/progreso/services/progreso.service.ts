import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TipoProgreso, type RegistroProgreso } from '@PrismaClient';
import type { CreateProgresoDto, ProgresoQueryDto, UpdateProgresoDto } from '../dto/index.js';
import { ProgresoRepository } from '../repositories/progreso.repository.js';
import { MedicionDuplicadaError } from '../errors/medicion-duplicada.error.js';
import {
  calcularEvolucion,
  validarFechaRegistro,
  validarFiltroFechas,
  validarMedicion,
} from './reglas-progreso.js';

export interface RegistroResumen {
  id: string;
  fecha: string;
  valor: number;
}
export interface SerieProgreso {
  tipo: TipoProgreso;
  ejercicio?: string;
  repeticiones?: number;
  registros: RegistroResumen[]; // fecha más reciente primero
  primero: number | null;
  ultimo: number | null;
  diferencia: number | null;
  porcentaje: number | null;
}

function fechaISO(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

function serializarRegistro(registro: RegistroProgreso): RegistroResumen & {
  tipo: TipoProgreso;
  ejercicio?: string;
  repeticiones?: number;
} {
  return {
    id: registro.id,
    fecha: fechaISO(registro.fecha),
    tipo: registro.tipo,
    valor: Number(registro.valor),
    ...(registro.ejercicio ? { ejercicio: registro.ejercicio } : {}),
    ...(registro.repeticiones ? { repeticiones: registro.repeticiones } : {}),
  };
}

@Injectable()
export class ProgresoService {
  constructor(private readonly repository: ProgresoRepository) {}

  private async miembroIdDeUsuario(usuarioId: string): Promise<string> {
    const miembroId = await this.repository.encontrarMiembroId(usuarioId);
    if (!miembroId) {
      throw new NotFoundException('No se encontró el perfil de miembro de tu cuenta.');
    }
    return miembroId;
  }

  async crear(usuarioId: string, dto: CreateProgresoDto, ahora: Date = new Date()) {
    const miembroId = await this.miembroIdDeUsuario(usuarioId);
    if (!Array.isArray(dto.mediciones) || dto.mediciones.length === 0) {
      throw new BadRequestException('Registra al menos una medición.');
    }
    const fecha = validarFechaRegistro(dto.fecha, ahora);
    const mediciones = dto.mediciones.map((m) => validarMedicion(m));

    // Detecta duplicados dentro del mismo POST antes de llegar a la DB.
    const claves = new Set<string>();
    for (const m of mediciones) {
      const clave = JSON.stringify([m.tipo, m.ejercicio, m.repeticiones]);
      if (claves.has(clave)) {
        throw new ConflictException('Ya registraste esta medición en esa fecha');
      }
      claves.add(clave);
    }
    try {
      const creados = await this.repository.crearMultiples(miembroId, fecha, mediciones);
      return { registros: creados.map(serializarRegistro) };
    } catch (error) {
      this.traducirDuplicado(error);
      throw error;
    }
  }

  async editar(usuarioId: string, id: string, dto: UpdateProgresoDto, ahora: Date = new Date()) {
    const miembroId = await this.miembroIdDeUsuario(usuarioId);
    const actual = await this.repository.findById(id);
    if (!actual) throw new NotFoundException('El registro no existe.');
    if (actual.miembroId !== miembroId) {
      throw new ForbiddenException('No tienes permiso para editar este registro.');
    }
    if (!Object.values(dto).some((value) => value !== undefined)) {
      throw new BadRequestException('Debes indicar al menos un campo para editar.');
    }
    const fecha = validarFechaRegistro(dto.fecha ?? fechaISO(actual.fecha), ahora);
    const medicion = validarMedicion({
      tipo: actual.tipo, // Inmutable; cambiaría la identidad de la serie
      valor: dto.valor ?? Number(actual.valor),
      ejercicio: dto.ejercicio ?? actual.ejercicio,
      repeticiones: dto.repeticiones ?? actual.repeticiones,
    });
    try {
      const actualizado = await this.repository.actualizar(id, {
        fecha,
        valor: medicion.valor,
        ejercicio: medicion.ejercicio,
        repeticiones: medicion.repeticiones,
      });
      return serializarRegistro(actualizado);
    } catch (error) {
      this.traducirDuplicado(error);
      throw error;
    }
  }

  async listarMio(usuarioId: string, query: ProgresoQueryDto): Promise<{ series: SerieProgreso[] }> {
    const miembroId = await this.miembroIdDeUsuario(usuarioId);
    validarFiltroFechas(query.desde, query.hasta);
    const registros = await this.repository.listar(miembroId, {
      tipo: query.tipo,
      desde: query.desde ? new Date(`${query.desde}T00:00:00.000Z`) : undefined,
      hasta: query.hasta ? new Date(`${query.hasta}T00:00:00.000Z`) : undefined,
    });

    const agrupados = new Map<string, RegistroProgreso[]>();
    for (const registro of registros) {
      // Las MARCA nunca se mezclan entre ejercicios o repeticiones diferentes.
      const clave = JSON.stringify([registro.tipo, registro.ejercicio, registro.repeticiones]);
      if (!agrupados.has(clave)) agrupados.set(clave, []);
      agrupados.get(clave)!.push(registro);
    }

    const series: SerieProgreso[] = [];
    for (const grupo of agrupados.values()) {
      const registroBase = grupo[0]!;
      // Repository lista de más reciente a más antiguo.
      const valoresEnOrdenCronologico = grupo.map((r) => Number(r.valor)).reverse();
      const calculo = calcularEvolucion(valoresEnOrdenCronologico);
      series.push({
        tipo: registroBase.tipo,
        ...(registroBase.ejercicio ? { ejercicio: registroBase.ejercicio } : {}),
        ...(registroBase.repeticiones ? { repeticiones: registroBase.repeticiones } : {}),
        registros: grupo.map((r) => ({
          id: r.id, fecha: fechaISO(r.fecha), valor: Number(r.valor),
        })),
        ...calculo,
      });
    }

    return { series };
  }

  private traducirDuplicado(error: unknown): void {
    if (error instanceof MedicionDuplicadaError) {
      throw new ConflictException('Ya registraste esta medición en esa fecha');
    }
  }
}
