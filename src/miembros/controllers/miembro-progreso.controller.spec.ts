import { BadRequestException, ParseUUIDPipe, UnauthorizedException, ValidationPipe, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard, RolesGuard } from '@Auth/guards';
import type { UsersService } from '@Users/services';
import type { MiembrosService } from '@Miembros/services';
import { Rol, TipoProgreso, type User } from '@PrismaClient';
import { ProgresoController } from '../../progreso/controllers/progreso.controller.js';
import { ProgresoQueryDto } from '../../progreso/dto/index.js';
import { MiembrosController } from './miembros.controller.js';
import type { MiembroProgresoService } from '../services/miembro-progreso.service.js';

describe('BE-14.2: contrato y guards del controlador', () => {
  const consulta = { consultar: vi.fn().mockResolvedValue({ series: [] }) };
  const controller = new MiembrosController({} as MiembrosService, consulta as unknown as MiembroProgresoService);
  const reflector = new Reflector();
  // Se obtiene la referencia para leer metadatos, nunca para invocarla sin this.
  const handler = Object.getOwnPropertyDescriptor(MiembrosController.prototype, 'consultarProgreso')!.value as () => void;
  const miembroId = '11111111-1111-4111-8111-111111111111';
  beforeEach(() => consulta.consultar.mockClear());

  const contexto = (rol?: Rol) => ({
    getHandler: () => handler, getClass: () => MiembrosController,
    switchToHttp: () => ({ getRequest: () => ({ headers: {}, user: rol ? { rol } : undefined }) }),
  }) as unknown as ExecutionContext;

  it('pasa únicamente la identidad autenticada, el UUID de ficha y los filtros', async () => {
    const filtros = { tipo: TipoProgreso.PESO, desde: '2026-11-01', hasta: '2026-11-17' };
    expect(await controller.consultarProgreso(miembroId, filtros, { id: 'entrenador-token' } as User)).toEqual({ series: [] });
    expect(consulta.consultar).toHaveBeenCalledWith('entrenador-token', miembroId, filtros);
  });

  it.each([Rol.MIEMBRO, Rol.RECEPCION, Rol.ADMINISTRADOR])('rechaza rol %s con 403', (rol) => {
    expect(() => new RolesGuard(reflector).canActivate(contexto(rol))).toThrow('No tienes permiso');
    expect(consulta.consultar).not.toHaveBeenCalled();
  });
  it('permite el rol ENTRENADOR', () => {
    expect(new RolesGuard(reflector).canActivate(contexto(Rol.ENTRENADOR))).toBe(true);
  });
  it('el guard global existente responde 401 sin token sin consultar usuarios ni progreso', async () => {
    const jwt = { verifyAsync: vi.fn() };
    const users = { findById: vi.fn() };
    const guard = new JwtAuthGuard(reflector, jwt as unknown as JwtService, users as unknown as UsersService);
    await expect(guard.canActivate(contexto())).rejects.toThrow(UnauthorizedException);
    expect(users.findById).not.toHaveBeenCalled();
    expect(consulta.consultar).not.toHaveBeenCalled();
  });
  it('UUID inválido produce 400 antes de la consulta', async () => {
    await expect(new ParseUUIDPipe().transform('invalido', { type: 'param', data: 'id' })).rejects.toThrow(BadRequestException);
    expect(consulta.consultar).not.toHaveBeenCalled();
  });
  it.each([{ tipo: 'OTRO' }, { desde: 'ayer' }, { hasta: '2026/11/17' }, { entrenadorId: miembroId }])('rechaza filtros inválidos/no autorizados %j', async (query) => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    await expect(pipe.transform(query, { type: 'query', metatype: ProgresoQueryDto })).rejects.toThrow(BadRequestException);
    expect(consulta.consultar).not.toHaveBeenCalled();
  });
  it.each(['crear', 'editar', 'listar'] as const)('H16 %s conserva MIEMBRO como único rol permitido', (metodo) => {
    // Ejercita RolesGuard con los metadatos reales, sin ampliar permisos H16.
    const ctx = (rol: Rol) => ({ getHandler: () => ProgresoController.prototype[metodo], getClass: () => ProgresoController,
      switchToHttp: () => ({ getRequest: () => ({ user: { rol } }) }) }) as unknown as ExecutionContext;
    for (const rol of Object.values(Rol)) {
      if (rol === Rol.MIEMBRO) expect(new RolesGuard(reflector).canActivate(ctx(rol))).toBe(true);
      else expect(() => new RolesGuard(reflector).canActivate(ctx(rol))).toThrow('No tienes permiso');
    }
  });
});
