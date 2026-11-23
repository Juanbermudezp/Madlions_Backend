import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '@Prisma/services';
import { Rol, TipoProgreso, type RegistroProgreso } from '@PrismaClient';
import { MiembroProgresoService } from '@Miembros/services';
import { MiembrosController } from '@Miembros/controllers';
import type { RutinaRepository } from '../../rutinas/repositories/rutina.repository.js';
import { rolesPermitidos } from '../../../test/helpers/roles.js';
import { ProgresoController } from '../controllers/progreso.controller.js';
import { MedicionDuplicadaError } from '../errors/medicion-duplicada.error.js';
import { ProgresoRepository } from '../repositories/progreso.repository.js';
import { ProgresoService } from './progreso.service.js';

const AHORA = new Date('2026-11-18T05:00:00Z'); // 17/11 a las 23:00 en El Salvador
const registro = (id: string, fecha: string, valor: number, extra: Partial<RegistroProgreso> = {}): RegistroProgreso => ({
    id, miembroId: 'm1', fecha: new Date(`${fecha}T00:00:00Z`), tipo: TipoProgreso.PESO,
    valor: valor as unknown as RegistroProgreso['valor'], ejercicio: null, repeticiones: null, creadoEn: AHORA, ...extra,
});
const marca = (id: string, fecha: string, valor: number, repeticiones: number) =>
    registro(id, fecha, valor, { tipo: TipoProgreso.MARCA, ejercicio: 'Sentadilla', repeticiones });

describe('H16. Registro y evolución de mi progreso', () => {
    const repo = { encontrarMiembroId: vi.fn(), findById: vi.fn(), crearMultiples: vi.fn(), actualizar: vi.fn(), listar: vi.fn() };
    const service = new ProgresoService(repo as unknown as ProgresoRepository);
    const crear = (fecha: string, mediciones: object[]) =>
        service.crear('u1', { fecha, mediciones } as Parameters<ProgresoService['crear']>[1], AHORA);

    beforeEach(() => {
        vi.resetAllMocks();
        repo.encontrarMiembroId.mockResolvedValue('m1');
        repo.crearMultiples.mockImplementation((_m: string, fecha: Date, ms: { tipo: TipoProgreso; valor: number }[]) =>
            Promise.resolve(ms.map((m, i) => registro(`r${i}`, fecha.toISOString().slice(0, 10), m.valor, { tipo: m.tipo }))));
    });

    it('AC1: guarda una fecha de hoy o anterior con peso, medidas y marcas dentro de sus rangos', async () => {
        await crear('2026-11-17', [
            { tipo: TipoProgreso.PESO, valor: 20 }, { tipo: TipoProgreso.CINTURA, valor: 250 },
            { tipo: TipoProgreso.MARCA, valor: 500, ejercicio: 'Sentadilla', repeticiones: 100 },
        ]);

        expect(repo.crearMultiples).toHaveBeenCalledWith('m1', new Date('2026-11-17T00:00:00Z'), [
            { tipo: TipoProgreso.PESO, valor: 20, ejercicio: null, repeticiones: null },
            { tipo: TipoProgreso.CINTURA, valor: 250, ejercicio: null, repeticiones: null },
            { tipo: TipoProgreso.MARCA, valor: 500, ejercicio: 'Sentadilla', repeticiones: 100 },
        ]);
    });

    it('AC2: lista cada medición de la más reciente a la más antigua y filtra por tipo y rango de fechas', async () => {
        repo.listar.mockResolvedValue([registro('b', '2026-11-10', 78), registro('a', '2026-11-01', 80)]);

        const { series } = await service.listarMio('u1', { tipo: TipoProgreso.PESO, desde: '2026-11-01', hasta: '2026-11-15' });

        expect(series[0]!.registros.map((r) => r.fecha)).toEqual(['2026-11-10', '2026-11-01']);
        expect(repo.listar).toHaveBeenCalledWith('m1', {
            tipo: TipoProgreso.PESO, desde: new Date('2026-11-01T00:00:00Z'), hasta: new Date('2026-11-15T00:00:00Z'),
        });

        const prisma = { registroProgreso: { findMany: vi.fn().mockResolvedValue([]) } };
        await new ProgresoRepository(prisma as unknown as PrismaService).listar('m1', {});
        expect(prisma.registroProgreso.findMany.mock.calls[0][0].orderBy[0]).toEqual({ fecha: 'desc' });
    });

    it('AC3: con dos o más registros calcula primero, último, diferencia y porcentaje; las marcas solo se comparan con el mismo ejercicio y repeticiones', async () => {
        repo.listar.mockResolvedValue([
            registro('c', '2026-11-15', 76.5), registro('b', '2026-11-08', 78), registro('a', '2026-11-01', 80),
            marca('m2', '2026-11-10', 70, 5), marca('m1', '2026-11-03', 60, 8),
        ]);

        const { series } = await service.listarMio('u1', {});

        expect(series.find((s) => s.tipo === TipoProgreso.PESO)).toMatchObject({ primero: 80, ultimo: 76.5, diferencia: -3.5, porcentaje: -4.4 });
        const marcas = series.filter((s) => s.tipo === TipoProgreso.MARCA);
        expect(marcas).toHaveLength(2);
        expect(marcas.every((s) => s.diferencia === null)).toBe(true);
    });

    it('AC4: sin registros no hay series y con un solo registro no hay comparación', async () => {
        repo.listar.mockResolvedValue([]);
        await expect(service.listarMio('u1', {})).resolves.toEqual({ series: [] });

        repo.listar.mockResolvedValue([registro('a', '2026-11-01', 80)]);
        const { series } = await service.listarMio('u1', {});
        expect(series[0]).toMatchObject({ primero: 80, diferencia: null, porcentaje: null });
    });

    it('AC5: rechaza la misma medición en la misma fecha con "Ya registraste esta medición en esa fecha" y permite editar el registro', async () => {
        repo.crearMultiples.mockRejectedValue(new MedicionDuplicadaError());
        await expect(crear('2026-11-17', [{ tipo: TipoProgreso.PESO, valor: 80 }])).rejects.toThrow(
            new ConflictException('Ya registraste esta medición en esa fecha'),
        );

        repo.findById.mockResolvedValue(registro('r1', '2026-11-17', 80));
        repo.actualizar.mockResolvedValue(registro('r1', '2026-11-17', 79.5));
        await expect(service.editar('u1', 'r1', { valor: 79.5 }, AHORA)).resolves.toMatchObject({ id: 'r1', valor: 79.5 });
    });

    it('AC6: rechaza valores en cero, negativos o fuera de rango y fechas futuras', async () => {
        for (const valor of [0, -1, 19.9, 300.1, 80.25]) {
            await expect(crear('2026-11-17', [{ tipo: TipoProgreso.PESO, valor }])).rejects.toBeInstanceOf(BadRequestException);
        }
        await expect(crear('2026-11-17', [{ tipo: TipoProgreso.MARCA, valor: 50, ejercicio: 'Press', repeticiones: 101 }])).rejects.toBeInstanceOf(BadRequestException);
        await expect(crear('2026-11-18', [{ tipo: TipoProgreso.PESO, valor: 80 }])).rejects.toThrow('No puedes registrar una fecha futura.');
        expect(repo.crearMultiples).not.toHaveBeenCalled();
    });

    it('AC7: un miembro no ve ni modifica el progreso de otro; el entrenador con rutina asignada lo ve sin modificarlo', async () => {
        repo.findById.mockResolvedValue(registro('r2', '2026-11-10', 80, { miembroId: 'm2' }));
        await expect(service.editar('u1', 'r2', { valor: 78 }, AHORA)).rejects.toBeInstanceOf(ForbiddenException);
        expect(repo.actualizar).not.toHaveBeenCalled();
        expect(rolesPermitidos(ProgresoController, 'editar')).toEqual([Rol.MIEMBRO]);

        const rutinas = { tieneAsignacion: vi.fn().mockResolvedValue(true) };
        const fichas = new MiembroProgresoService(rutinas as unknown as RutinaRepository, service);
        repo.listar.mockResolvedValue([]);
        await expect(fichas.consultar('e1', 'm2', {})).resolves.toEqual({ series: [] });
        expect(rolesPermitidos(MiembrosController, 'consultarProgreso')).toEqual([Rol.ENTRENADOR]);
    });
});
