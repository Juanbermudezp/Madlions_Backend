import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { PrismaService } from '@Prisma/services';
import { Rol, type Resena } from '@PrismaClient';
import { TipoActividad } from '@Asistencia/dto';
import { ResenaRepository, type RegistroParaCalificar } from '@Resenas/repositories';
import { CrearResenaDto } from '@Resenas/dto';
import { rolesPermitidos } from '../../../test/helpers/roles.js';
import { ResenasController } from '../controllers/resenas.controller.js';
import { CALIFICA_AL_MENOS_UN_ASPECTO } from './reglas-resena.js';
import { ResenasService } from './resenas.service.js';

const REGISTRO = '11111111-1111-4111-8111-111111111111';
const FIN = new Date('2026-11-18T15:00:00Z');
const registro = (datos: Partial<RegistroParaCalificar> = {}): RegistroParaCalificar => ({
    registroId: REGISTRO, miembroId: 'm1', entrenadorId: 'e1', tipoClaseId: 't1', fin: FIN, asistio: true, yaCalificada: false, ...datos,
});
const resena = (datos: Partial<Resena>): Resena => ({
    id: 'res1', miembroId: 'm1', reservaId: REGISTRO, sesionId: null, entrenadorId: 'e1', tipoClaseId: 't1',
    calActividad: null, calEntrenador: null, calInstalaciones: null, comentario: null, creadaEn: new Date('2026-11-20T10:00:00Z'), ...datos,
}) as Resena;

describe('H20. Calificación de una clase o sesión', () => {
    const repo = { findMiembroIdDeUsuario: vi.fn(), findPendientes: vi.fn(), findRegistro: vi.fn(), crear: vi.fn() };
    const service = new ResenasService(repo as unknown as ResenaRepository);
    const calificar = (datos: Partial<CrearResenaDto>) => service.crear('u1', { tipo: TipoActividad.CLASE, registroId: REGISTRO, ...datos });

    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-11-20T16:00:00Z'));
        vi.resetAllMocks();
        repo.findMiembroIdDeUsuario.mockResolvedValue('m1');
        repo.findRegistro.mockResolvedValue(registro());
        repo.crear.mockImplementation((d: Partial<Resena>) => Promise.resolve(resena(d)));
    });
    afterEach(() => vi.useRealTimers());

    it('AC1: lista las clases y sesiones con "Asistió" de los últimos 7 días sin reseña, con su fecha límite', async () => {
        repo.findPendientes.mockResolvedValue([{ tipo: TipoActividad.CLASE, registroId: REGISTRO, nombre: 'Yoga', entrenador: 'Luis', fin: FIN }]);
        const lista = await service.pendientes('u1');
        expect(lista[0]).toMatchObject({ nombre: 'Yoga', fechaLimite: '2026-11-25T15:00:00.000Z' });

        const prisma = { reserva: { findMany: vi.fn().mockResolvedValue([]) }, sesionPersonal: { findMany: vi.fn().mockResolvedValue([]) } };
        const ahora = new Date('2026-11-20T16:00:00Z');
        await new ResenaRepository(prisma as unknown as PrismaService).findPendientes('m1', ahora);
        expect(prisma.reserva.findMany.mock.calls[0][0].where).toMatchObject({
            asistencia: 'ASISTIO', resena: null, clase: { fin: { gte: new Date('2026-11-13T16:00:00Z'), lte: ahora } },
        });
    });

    it('AC2: califica de 1 a 5 estrellas cada aspecto por separado, puede omitir aspectos y comentar hasta 500 caracteres', async () => {
        const res = await calificar({ calEntrenador: 5, comentario: 'Excelente' });
        expect(repo.crear).toHaveBeenCalledWith(expect.objectContaining({ calActividad: undefined, calEntrenador: 5, calInstalaciones: undefined }));
        expect(res).toMatchObject({ calEntrenador: 5, comentario: 'Excelente' });

        const errores = async (d: object) => (await validate(plainToInstance(CrearResenaDto, { tipo: 'CLASE', registroId: REGISTRO, ...d }))).length;
        expect(await errores({ calActividad: 1, calEntrenador: 5, calInstalaciones: 3, comentario: 'x'.repeat(500) })).toBe(0);
        expect(await errores({ calActividad: 6 })).toBeGreaterThan(0);
        expect(await errores({ calActividad: 0 })).toBeGreaterThan(0);
        expect(await errores({ calActividad: 3, comentario: 'x'.repeat(501) })).toBeGreaterThan(0);
    });

    it('AC3: después de guardar, la reseña queda ligada al registro y ya no está pendiente', async () => {
        await calificar({ calActividad: 4 });
        expect(repo.crear).toHaveBeenCalledWith(expect.objectContaining({ registroId: REGISTRO, miembroId: 'm1', entrenadorId: 'e1' }));

        const prisma = { reserva: { findMany: vi.fn().mockResolvedValue([]) }, sesionPersonal: { findMany: vi.fn().mockResolvedValue([]) } };
        await new ResenaRepository(prisma as unknown as PrismaService).findPendientes('m1', new Date());
        expect(prisma.reserva.findMany.mock.calls[0][0].where.resena).toBeNull();
    });

    it('AC4: sin ninguna calificación se rechaza con "Califica al menos un aspecto"', async () => {
        await expect(calificar({ comentario: 'Sin estrellas' })).rejects.toThrow(new BadRequestException(CALIFICA_AL_MENOS_UN_ASPECTO));
        expect(repo.crear).not.toHaveBeenCalled();
    });

    it('AC5: rechaza sin asistencia "Asistió", fuera de los 7 días, ya calificada o de otro miembro', async () => {
        repo.findRegistro.mockResolvedValue(registro({ asistio: false }));
        await expect(calificar({ calActividad: 4 })).rejects.toBeInstanceOf(ConflictException);
        repo.findRegistro.mockResolvedValue(registro({ fin: new Date('2026-11-13T15:59:00Z') }));
        await expect(calificar({ calActividad: 4 })).rejects.toBeInstanceOf(ConflictException);
        repo.findRegistro.mockResolvedValue(registro({ yaCalificada: true }));
        await expect(calificar({ calActividad: 4 })).rejects.toBeInstanceOf(ConflictException);
        repo.findRegistro.mockResolvedValue(registro({ miembroId: 'otro' }));
        await expect(calificar({ calActividad: 4 })).rejects.toBeInstanceOf(ForbiddenException);
        expect(repo.crear).not.toHaveBeenCalled();
    });

    it('AC6: entrenador, recepción y administrador no pueden calificar ("Acceso denegado")', () => {
        expect(rolesPermitidos(ResenasController, 'crear')).toEqual([Rol.MIEMBRO]);
        expect(rolesPermitidos(ResenasController, 'pendientes')).toEqual([Rol.MIEMBRO]);
    });
});
