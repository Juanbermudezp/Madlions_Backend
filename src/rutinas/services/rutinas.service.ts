import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@PrismaClient';
import { esFechaValida, hoyLocal } from '@Common/fechas';
import { assertOwnership } from '@Common/ownership';
import { RutinaRepository } from '../repositories/rutina.repository.js';
import type { CreateRutinaDto, UpdateRutinaDto } from '../dto/index.js';
import { RutinaResponseDto } from '../dto/rutina-response.dto.js';

@Injectable()
export class RutinasService {
  constructor(private readonly repository: RutinaRepository) {}

  async crear(entrenadorId: string, dto: CreateRutinaDto, ahora = new Date()): Promise<RutinaResponseDto> {
    const fechaInicio = this.validarFecha(dto.fechaInicio, ahora);
    if (!(await this.repository.existeMiembro(dto.miembroId))) {
      throw new NotFoundException('El miembro no existe.');
    }
    try {
      return RutinaResponseDto.fromEntity(await this.repository.crear(entrenadorId, dto.miembroId, {
        nombre: dto.nombre, objetivo: dto.objetivo, fechaInicio, dias: dto.dias,
      }));
    } catch (error) { throw this.traducirError(error); }
  }

  async listar(entrenadorId: string, miembroId?: string): Promise<RutinaResponseDto[]> {
    return (await this.repository.listar(entrenadorId, miembroId)).map((rutina) => RutinaResponseDto.fromEntity(rutina));
  }

  async actualizar(id: string, entrenadorId: string, dto: UpdateRutinaDto, ahora = new Date()): Promise<RutinaResponseDto> {
    const actual = await this.repository.findById(id);
    if (!actual) throw new NotFoundException('La rutina no existe.');
    assertOwnership(actual.entrenadorId, entrenadorId);
    const fechaInicio = this.validarFecha(dto.fechaInicio, ahora, actual.fechaInicio.toISOString().slice(0, 10));
    try {
      return RutinaResponseDto.fromEntity(await this.repository.reemplazar(id, entrenadorId, {
        nombre: dto.nombre, objetivo: dto.objetivo, fechaInicio, dias: dto.dias,
      }));
    } catch (error) { throw this.traducirError(error); }
  }

  private validarFecha(fecha: string, ahora: Date, anterior?: string): Date {
    if (!esFechaValida(fecha)) throw new BadRequestException('La fecha de inicio no es válida.');
    if (fecha !== anterior && fecha < hoyLocal(ahora)) {
      throw new BadRequestException('La fecha de inicio debe ser hoy o posterior en El Salvador.');
    }
    return new Date(`${fecha}T00:00:00.000Z`);
  }

  private traducirError(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2025', 'P2003'].includes(error.code)) {
      return new NotFoundException('La rutina o uno de sus usuarios ya no existe.');
    }
    return error;
  }
}
