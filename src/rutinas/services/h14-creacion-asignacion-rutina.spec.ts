import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MiembroProgresoService } from '@Miembros/services';
import type { ProgresoService } from '../../progreso/services/progreso.service.js';
import { Rol } from '@PrismaClient';
import { rolesPermitidos } from '../../../test/helpers/roles.js';
import { detalle, MIEMBRO_A, RUTINA_A, USUARIO_A } from '../../../test/fixtures/rutinas-miembro.fixture.js';
import { RutinasController } from '../controllers/rutinas.controller.js';
import { RutinasMiembroController } from '../controllers/rutinas-miembro.controller.js';
import { CreateRutinaDto, type UpdateRutinaDto } from '../dto/index.js';
import type { RutinaCompleta, RutinaRepository } from '../repositories/rutina.repository.js';
import type { RutinaMiembroRepository } from '../repositories/rutina-miembro.repository.js';
import { RutinasMiembroService } from './rutinas-miembro.service.js';
import { RutinasService } from './rutinas.service.js';

const AHORA = new Date('2026-11-18T05:59:59Z'); // todavía 17/11 en El Salvador
const opciones = { whitelist: true, forbidNonWhitelisted: true };
const ejercicio = { nombre: 'Press banca', series: 4, repeticiones: 8, descansoSeg: 120 };
const datos = { nombre: 'Fuerza', objetivo: 'Mejorar', fechaInicio: '2026-11-17', dias: [{ nombre: 'A', ejercicios: [ejercicio] }] } satisfies UpdateRutinaDto;
const dto = { ...datos, miembroId: '11111111-1111-4111-8111-111111111111' } satisfies CreateRutinaDto;
const entidad: RutinaCompleta = {
    id: 'r1', miembroId: dto.miembroId, entrenadorId: 'e1', nombre: datos.nombre, objetivo: datos.objetivo,
    fechaInicio: new Date('2026-11-17T00:00:00Z'), creadoEn: AHORA, actualizadoEn: AHORA,
    miembro: { id: dto.miembroId, codigoMiembro: 'MBR-000001', usuario: { nombre: 'Ana', apellido: 'Paz' } },
    dias: [{ id: 'd1', rutinaId: 'r1', orden: 1, nombre: 'A', ejercicios: [{ id: 'ej1', diaId: 'd1', orden: 1, ...ejercicio }] }],
};

const errores = async (cambios: object) =>
    (await validate(plainToInstance(CreateRutinaDto, { ...dto, ...cambios }), opciones)).length;

describe('H14. Creación y asignación de una rutina', () => {
    const repo = { existeMiembro: vi.fn(), findById: vi.fn(), crear: vi.fn(), listar: vi.fn(), reemplazar: vi.fn(), tieneAsignacion: vi.fn() };
    const service = new RutinasService(repo as unknown as RutinaRepository);

    beforeEach(() => {
        vi.resetAllMocks();
        repo.existeMiembro.mockResolvedValue({ id: dto.miembroId });
        repo.findById.mockResolvedValue(entidad);
        repo.crear.mockResolvedValue(entidad);
        repo.reemplazar.mockResolvedValue(entidad);
    });

    it('AC1: crea una rutina con nombre de 3 a 60, objetivo hasta 200 y fecha de hoy o posterior, asociada al miembro y al entrenador', async () => {
        expect(await errores({ nombre: 'Abc' })).toBe(0);
        expect(await errores({ nombre: 'ab' })).toBeGreaterThan(0);
        expect(await errores({ objetivo: 'x'.repeat(201) })).toBeGreaterThan(0);

        const res = await service.crear('e1', dto, AHORA);
        expect(repo.crear).toHaveBeenCalledWith('e1', dto.miembroId, expect.objectContaining({ nombre: 'Fuerza', fechaInicio: new Date('2026-11-17T00:00:00Z') }));
        expect(res).toMatchObject({ miembroId: dto.miembroId, entrenadorId: 'e1', fechaInicio: '2026-11-17' });

        await expect(service.crear('e1', { ...dto, fechaInicio: '2026-11-16' }, AHORA)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('AC2: cada rutina tiene de 1 a 7 días y cada día de 1 a 15 ejercicios con series 1-10, repeticiones 1-50 y descanso 0-600', async () => {
        const dia = { nombre: 'A', ejercicios: [ejercicio] };
        expect(await errores({ dias: Array(7).fill(dia) })).toBe(0);
        expect(await errores({ dias: Array(8).fill(dia) })).toBeGreaterThan(0);
        expect(await errores({ dias: [{ nombre: 'A', ejercicios: Array(15).fill(ejercicio) }] })).toBe(0);
        expect(await errores({ dias: [{ nombre: 'A', ejercicios: Array(16).fill(ejercicio) }] })).toBeGreaterThan(0);
        expect(await errores({ dias: [{ nombre: 'A', ejercicios: [{ ...ejercicio, series: 10, repeticiones: 50, descansoSeg: 600 }] }] })).toBe(0);
    });

    it('AC3: la rutina guardada aparece en "Mis rutinas" del miembro en su siguiente consulta', async () => {
        await service.crear('e1', dto, AHORA);

        const miembroRepo = { miembroDeUsuario: vi.fn().mockResolvedValue({ id: MIEMBRO_A }), listarPropias: vi.fn().mockResolvedValue([detalle]), propietario: vi.fn(), detallePropio: vi.fn() };
        const lista = await new RutinasMiembroService(miembroRepo as unknown as RutinaMiembroRepository).listar(USUARIO_A);
        expect(lista.map((r) => r.id)).toEqual([RUTINA_A]);
    });

    it('AC4: el entrenador edita los ejercicios de su propia rutina', async () => {
        const nuevos = { ...datos, dias: [{ nombre: 'B', ejercicios: [{ ...ejercicio, series: 5 }] }] };

        await service.actualizar('r1', 'e1', nuevos, AHORA);

        expect(repo.reemplazar).toHaveBeenCalledWith('r1', 'e1', expect.objectContaining({ dias: nuevos.dias }));
    });

    it('AC5: no guarda rutinas sin ejercicios, con series o repeticiones menores que 1 o descansos negativos', async () => {
        expect(await errores({ dias: [{ nombre: 'A', ejercicios: [] }] })).toBeGreaterThan(0);
        expect(await errores({ dias: [] })).toBeGreaterThan(0);
        expect(await errores({ dias: [{ nombre: 'A', ejercicios: [{ ...ejercicio, series: 0 }] }] })).toBeGreaterThan(0);
        expect(await errores({ dias: [{ nombre: 'A', ejercicios: [{ ...ejercicio, repeticiones: 0 }] }] })).toBeGreaterThan(0);
        expect(await errores({ dias: [{ nombre: 'A', ejercicios: [{ ...ejercicio, descansoSeg: -1 }] }] })).toBeGreaterThan(0);
    });

    it('AC6: no se puede editar la rutina de otro entrenador y un miembro no crea ni modifica rutinas', async () => {
        await expect(service.actualizar('r1', 'otro-entrenador', datos, AHORA)).rejects.toBeInstanceOf(ForbiddenException);
        expect(repo.reemplazar).not.toHaveBeenCalled();

        expect(rolesPermitidos(RutinasController, 'crear')).toEqual([Rol.ENTRENADOR]);
        expect(rolesPermitidos(RutinasController, 'actualizar')).toEqual([Rol.ENTRENADOR]);
        expect(Object.getOwnPropertyNames(RutinasMiembroController.prototype)).not.toContain('actualizar');
    });

    it('AC7: con al menos una rutina asignada el entrenador ve el progreso del miembro en solo lectura', async () => {
        const progreso = { listarPorMiembro: vi.fn().mockResolvedValue({ registros: [] }) };
        const fichas = new MiembroProgresoService(repo as unknown as RutinaRepository, progreso as unknown as ProgresoService);

        repo.tieneAsignacion.mockResolvedValue(true);
        await expect(fichas.consultar('e1', MIEMBRO_A, {})).resolves.toEqual({ registros: [] });

        repo.tieneAsignacion.mockResolvedValue(false);
        await expect(fichas.consultar('e1', MIEMBRO_A, {})).rejects.toBeInstanceOf(ForbiddenException);
    });
});
