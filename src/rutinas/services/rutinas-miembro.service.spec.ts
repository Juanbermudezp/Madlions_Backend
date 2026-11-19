import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RutinasMiembroService } from './rutinas-miembro.service.js';
import type { RutinaMiembroRepository } from '../repositories/rutina-miembro.repository.js';
import { detalle, MIEMBRO_A, MIEMBRO_B, resumenAnterior, resumenReciente, RUTINA_A, USUARIO_A } from '../../../test/fixtures/rutinas-miembro.fixture.js';

describe('BE-15.1 RutinasMiembroService', () => {
  const repo = { miembroDeUsuario: vi.fn(), listarPropias: vi.fn(), propietario: vi.fn(), detallePropio: vi.fn() };
  const service = new RutinasMiembroService(repo as unknown as RutinaMiembroRepository);
  beforeEach(() => {
    vi.resetAllMocks();
    repo.miembroDeUsuario.mockResolvedValue({ id: MIEMBRO_A });
    repo.listarPropias.mockResolvedValue([resumenReciente, resumenAnterior]);
    repo.propietario.mockResolvedValue({ miembroId: MIEMBRO_A });
    repo.detallePropio.mockResolvedValue(detalle);
  });
  it('resuelve usuario->ficha y devuelve ambos resúmenes en el orden del repositorio', async () => {
    const lista = await service.listar(USUARIO_A);
    expect(repo.miembroDeUsuario).toHaveBeenCalledWith(USUARIO_A);
    expect(repo.listarPropias).toHaveBeenCalledWith(MIEMBRO_A);
    expect(lista.map((r) => r.fechaInicio)).toEqual(['2026-11-18', '2026-11-16']);
    expect(lista[0]?.entrenador).toEqual(resumenReciente.entrenador);
    expect(Object.keys(lista[0]!).sort()).toEqual(['entrenador', 'fechaInicio', 'id', 'nombre', 'objetivo']);
  });
  it('sin asignaciones devuelve []', async () => {
    repo.listarPropias.mockResolvedValue([]);
    expect(await service.listar(USUARIO_A)).toEqual([]);
  });
  it('sin ficha da 404 sin consultar rutinas', async () => {
    repo.miembroDeUsuario.mockResolvedValue(null);
    await expect(service.listar(USUARIO_A)).rejects.toThrow(NotFoundException);
    await expect(service.detalle(USUARIO_A, RUTINA_A)).rejects.toThrow(NotFoundException);
    expect(repo.listarPropias).not.toHaveBeenCalled(); expect(repo.propietario).not.toHaveBeenCalled();
  });
  it('autoriza antes de leer días/ejercicios, conserva DATE y campos del detalle', async () => {
    const resultado = await service.detalle(USUARIO_A, RUTINA_A);
    expect(repo.detallePropio).toHaveBeenCalledWith(RUTINA_A, MIEMBRO_A);
    expect(repo.propietario.mock.invocationCallOrder[0]).toBeLessThan(repo.detallePropio.mock.invocationCallOrder[0]!);
    expect(resultado.fechaInicio).toBe('2026-11-18');
    expect(resultado.dias).toEqual(detalle.dias);
  });
  it('rutina ajena da 403 sin leer sus hijos', async () => {
    repo.propietario.mockResolvedValue({ miembroId: MIEMBRO_B });
    await expect(service.detalle(USUARIO_A, RUTINA_A)).rejects.toThrow(ForbiddenException);
    expect(repo.detallePropio).not.toHaveBeenCalled();
  });
  it('rutina inexistente da 404', async () => {
    repo.propietario.mockResolvedValue(null);
    await expect(service.detalle(USUARIO_A, RUTINA_A)).rejects.toThrow(NotFoundException);
    expect(repo.detallePropio).not.toHaveBeenCalled();
  });
  it('desaparición o cambio de dueño concurrente no devuelve un detalle anterior', async () => {
    repo.detallePropio.mockResolvedValue(null);
    await expect(service.detalle(USUARIO_A, RUTINA_A)).rejects.toThrow(NotFoundException);
  });
  it('consulta cada vez y devuelve los datos nuevos tras una edición', async () => {
    const inicial = await service.detalle(USUARIO_A, RUTINA_A);
    repo.detallePropio.mockResolvedValue({ ...detalle, nombre: 'Rutina actualizada', dias: [] });
    const actual = await service.detalle(USUARIO_A, RUTINA_A);
    expect(actual.nombre).toBe('Rutina actualizada'); expect(actual.dias).toEqual([]);
    expect(inicial.nombre).toBe('Fuerza general');
    expect(repo.detallePropio).toHaveBeenCalledTimes(2);
  });
});
