import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@PrismaClient';
import { RutinasService } from './rutinas.service.js';
import type { RutinaCompleta, RutinaRepository } from '../repositories/rutina.repository.js';
import type { CreateRutinaDto, UpdateRutinaDto } from '../dto/index.js';

const AHORA = new Date('2026-11-18T05:59:59Z'); // Todavía 17 en El Salvador.
const datos = { nombre: 'Fuerza', objetivo: 'Mejorar', fechaInicio: '2026-11-17',
  dias: [{ nombre: 'A', ejercicios: [{ nombre: 'Press', series: 4, repeticiones: 8, descansoSeg: 120 }] }] } satisfies UpdateRutinaDto;
const dto = { ...datos, miembroId: 'm1' } satisfies CreateRutinaDto;
const entidad: RutinaCompleta = { id: 'r1', miembroId: 'm1', entrenadorId: 'e1', nombre: datos.nombre,
  objetivo: datos.objetivo, fechaInicio: new Date('2026-11-17T00:00:00Z'), creadoEn: AHORA, actualizadoEn: AHORA,
  miembro: { id: 'm1', codigoMiembro: 'MBR-000001', usuario: { nombre: 'Ana', apellido: 'Paz' } },
  dias: [{ id: 'd1', rutinaId: 'r1', orden: 1, nombre: 'A', ejercicios: [
    { id: 'ej1', diaId: 'd1', orden: 1, ...datos.dias[0]!.ejercicios[0]! },
  ] }],
};

describe('RutinasService', () => {
  const repo = { existeMiembro: vi.fn(), findById: vi.fn(), crear: vi.fn(), listar: vi.fn(), reemplazar: vi.fn() };
  const service = new RutinasService(repo as unknown as RutinaRepository);
  beforeEach(() => {
    vi.resetAllMocks();
    repo.existeMiembro.mockResolvedValue({ id: 'm1' });
    repo.findById.mockResolvedValue(entidad);
    repo.crear.mockResolvedValue(entidad);
    repo.reemplazar.mockResolvedValue(entidad);
    repo.listar.mockResolvedValue([entidad]);
  });

  it('asigna al miembro solicitado y exclusivamente al entrenador autenticado', async () => {
    const respuesta = await service.crear('e1', dto, AHORA);
    expect(repo.crear).toHaveBeenCalledWith('e1', 'm1', expect.objectContaining({ fechaInicio: entidad.fechaInicio }));
    expect(respuesta).toMatchObject({ miembroId: 'm1', entrenadorId: 'e1', fechaInicio: '2026-11-17',
      miembro: { id: 'm1', nombre: 'Ana', apellido: 'Paz', codigo: 'MBR-000001' } });
    expect(respuesta.miembro).not.toHaveProperty('usuario');
    expect(respuesta.miembro).not.toHaveProperty('documento');
  });
  it('rechaza miembro inexistente sin escribir', async () => {
    repo.existeMiembro.mockResolvedValue(null);
    await expect(service.crear('e1', dto, AHORA)).rejects.toThrow(NotFoundException);
    expect(repo.crear).not.toHaveBeenCalled();
  });
  it.each(['2026-11-16', '2026-02-30', '2026-13-01', '2026-1-01', ''])('rechaza fecha %s', async (fechaInicio) => {
    await expect(service.crear('e1', { ...dto, fechaInicio }, AHORA)).rejects.toThrow(BadRequestException);
    expect(repo.crear).not.toHaveBeenCalled();
  });
  it('usa el cambio de día local a las 06:00 UTC y acepta fechas futuras', async () => {
    await expect(service.crear('e1', dto, AHORA)).resolves.toBeDefined();
    await expect(service.crear('e1', dto, new Date('2026-11-18T06:00:00Z'))).rejects.toThrow(BadRequestException);
    await expect(service.crear('e1', { ...dto, fechaInicio: '2026-11-19' }, AHORA)).resolves.toBeDefined();
    await expect(service.crear('e1', { ...dto, fechaInicio: '2028-02-29' }, AHORA)).resolves.toBeDefined();
  });
  it('consulta solo por entrenador autenticado incluso si filtra otro miembro', async () => {
    await service.listar('e1', 'm2');
    expect(repo.listar).toHaveBeenCalledWith('e1', 'm2');
    repo.listar.mockResolvedValue([]);
    expect(await service.listar('e1')).toEqual([]);
  });
  it('rechaza edición ajena sin llegar al reemplazo', async () => {
    await expect(service.actualizar('r1', 'e2', datos, AHORA)).rejects.toThrow(ForbiddenException);
    expect(repo.reemplazar).not.toHaveBeenCalled();
  });
  it('devuelve 404 para rutina inexistente', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.actualizar('no-existe', 'e1', datos, AHORA)).rejects.toThrow(NotFoundException);
    expect(repo.reemplazar).not.toHaveBeenCalled();
  });
  it('permite conservar una fecha pasada, pero no cambiarla por otra pasada', async () => {
    const despues = new Date('2026-11-20T12:00:00Z');
    await service.actualizar('r1', 'e1', datos, despues);
    expect(repo.reemplazar).toHaveBeenCalledWith('r1', 'e1', expect.objectContaining({ fechaInicio: entidad.fechaInicio }));
    await expect(service.actualizar('r1', 'e1', { ...datos, fechaInicio: '2026-11-18' }, despues)).rejects.toThrow(BadRequestException);
    await expect(service.actualizar('r1', 'e1', { ...datos, fechaInicio: '2026-02-30' }, despues)).rejects.toThrow(BadRequestException);
    await expect(service.actualizar('r1', 'e1', { ...datos, fechaInicio: '2026-11-20' }, despues)).resolves.toBeDefined();
  });
  it('propaga fallo transaccional y traduce desaparición concurrente a 404', async () => {
    const fallo = new Error('fallo de escritura');
    repo.reemplazar.mockRejectedValue(fallo);
    await expect(service.actualizar('r1', 'e1', datos, AHORA)).rejects.toBe(fallo);
    for (const code of ['P2025', 'P2003']) {
      const error = new Prisma.PrismaClientKnownRequestError('no existe', { code, clientVersion: '7.10.0' });
      repo.reemplazar.mockRejectedValue(error);
      repo.crear.mockRejectedValue(error);
      await expect(service.actualizar('r1', 'e1', datos, AHORA)).rejects.toThrow(NotFoundException);
      await expect(service.crear('e1', dto, AHORA)).rejects.toThrow(NotFoundException);
    }
  });
});
