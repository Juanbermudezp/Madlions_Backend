import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '@Prisma/services';
import { Rol } from '@PrismaClient';
import { rolesPermitidos } from '../../../test/helpers/roles.js';
import { detalle, MIEMBRO_A, MIEMBRO_B, resumenAnterior, resumenReciente, RUTINA_A, USUARIO_A } from '../../../test/fixtures/rutinas-miembro.fixture.js';
import { RutinasMiembroController } from '../controllers/rutinas-miembro.controller.js';
import { RutinaMiembroRepository } from '../repositories/rutina-miembro.repository.js';
import { RutinasMiembroService } from './rutinas-miembro.service.js';

describe('H15. Consulta de rutinas asignadas', () => {
    const repo = { miembroDeUsuario: vi.fn(), listarPropias: vi.fn(), propietario: vi.fn(), detallePropio: vi.fn() };
    const service = new RutinasMiembroService(repo as unknown as RutinaMiembroRepository);

    beforeEach(() => {
        vi.resetAllMocks();
        repo.miembroDeUsuario.mockResolvedValue({ id: MIEMBRO_A });
        repo.listarPropias.mockResolvedValue([resumenReciente, resumenAnterior]);
        repo.propietario.mockResolvedValue({ miembroId: MIEMBRO_A });
        repo.detallePropio.mockResolvedValue(detalle);
    });

    it('AC1: lista mis rutinas con nombre, objetivo, fecha de inicio y entrenador, la más reciente primero', async () => {
        const lista = await service.listar(USUARIO_A);

        expect(lista[0]).toEqual({
            id: RUTINA_A, nombre: 'Fuerza general', objetivo: 'Mejorar fuerza', fechaInicio: '2026-11-18',
            entrenador: resumenReciente.entrenador,
        });
        expect(lista.map((r) => r.fechaInicio)).toEqual(['2026-11-18', '2026-11-16']);

        const prisma = { rutina: { findMany: vi.fn().mockResolvedValue([]) } };
        await new RutinaMiembroRepository(prisma as unknown as PrismaService).listarPropias(MIEMBRO_A);
        expect(prisma.rutina.findMany.mock.calls[0][0].orderBy[0]).toEqual({ fechaInicio: 'desc' });
    });

    it('AC2: el detalle trae los días y los ejercicios en orden con series, repeticiones y descanso', async () => {
        const rutina = await service.detalle(USUARIO_A, RUTINA_A);

        expect(rutina.dias.map((d) => d.nombre)).toEqual(['Pecho', 'Piernas']);
        expect(rutina.dias[0]!.ejercicios[1]).toEqual({ id: 'ej-b', orden: 2, nombre: 'Press militar', series: 3, repeticiones: 10, descansoSeg: 60 });
    });

    it('AC3: siempre lee la versión guardada más reciente (sin caché)', async () => {
        await service.detalle(USUARIO_A, RUTINA_A);
        repo.detallePropio.mockResolvedValue({ ...detalle, dias: [{ ...detalle.dias[0]!, nombre: 'Pecho y hombro' }] });

        const actualizada = await service.detalle(USUARIO_A, RUTINA_A);

        expect(actualizada.dias[0]!.nombre).toBe('Pecho y hombro');
        expect(repo.detallePropio).toHaveBeenCalledTimes(2);
    });

    it('AC4: sin rutinas asignadas la lista viene vacía', async () => {
        repo.listarPropias.mockResolvedValue([]);
        await expect(service.listar(USUARIO_A)).resolves.toEqual([]);
    });

    it('AC5: no puedo consultar la rutina de otro miembro ni modificar ejercicios desde esta pantalla', async () => {
        repo.propietario.mockResolvedValue({ miembroId: MIEMBRO_B });

        await expect(service.detalle(USUARIO_A, RUTINA_A)).rejects.toBeInstanceOf(ForbiddenException);
        expect(repo.detallePropio).not.toHaveBeenCalled();

        expect(rolesPermitidos(RutinasMiembroController, 'listar')).toEqual([Rol.MIEMBRO]);
        expect(Object.getOwnPropertyNames(RutinasMiembroController.prototype).sort()).toEqual(['constructor', 'detalle', 'listar']);
    });
});
