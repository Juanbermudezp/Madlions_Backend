import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '@Prisma/services';
import { AsistenciaReserva, Rol } from '@PrismaClient';
import { AsistenciaRepository, type ActividadConMiembros, type RegistroParaMarcar } from '@Asistencia/repositories';
import { MarcaAsistencia, TipoActividad } from '@Asistencia/dto';
import type { ResenaRepository } from '@Resenas/repositories';
import { ResenasService } from '../../resenas/services/resenas.service.js';
import { rolesPermitidos } from '../../../test/helpers/roles.js';
import { AsistenciaController } from '../controllers/asistencia.controller.js';
import { AsistenciaService } from './asistencia.service.js';
import { FUERA_DE_VENTANA } from './reglas-asistencia.js';

const INICIO = new Date('2026-11-20T14:00:00Z');
const FIN = new Date('2026-11-20T15:00:00Z');
const registro = (datos: Partial<RegistroParaMarcar> = {}): RegistroParaMarcar =>
    ({ registroId: 'r1', entrenadorId: 'e1', inicio: INICIO, fin: FIN, activo: true, ...datos });
const marca = (registroId: string, asistencia = MarcaAsistencia.ASISTIO) => ({ tipo: TipoActividad.CLASE, registroId, asistencia });
const actividad: ActividadConMiembros = {
    tipo: TipoActividad.CLASE, id: 'c1', nombre: 'Spinning', inicio: INICIO, fin: FIN,
    miembros: [{ registroId: 'r1', nombre: 'María López', codigo: 'MBR-000002', asistencia: AsistenciaReserva.SIN_REGISTRAR }],
};

describe('H19. Registro de asistencia', () => {
    const repo = { findActividades: vi.fn(), findRegistro: vi.fn(), marcar: vi.fn() };
    const service = new AsistenciaService(repo as unknown as AsistenciaRepository);
    const enHora = (iso: string) => vi.setSystemTime(new Date(iso));

    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        enHora('2026-11-20T16:00:00Z');
        vi.resetAllMocks();
        repo.findRegistro.mockResolvedValue(registro());
        repo.findActividades.mockResolvedValue([actividad]);
    });
    afterEach(() => vi.useRealTimers());

    it('AC1: lista mis clases y sesiones ya iniciadas que terminaron hace 24 horas o menos, con sus miembros confirmados', async () => {
        const res = await service.pendientes('e1');
        expect(res[0]).toMatchObject({ tipo: 'CLASE', nombre: 'Spinning', miembros: [{ nombre: 'María López', asistencia: 'SIN_REGISTRAR' }] });

        const prisma = { clase: { findMany: vi.fn().mockResolvedValue([]) }, sesionPersonal: { findMany: vi.fn().mockResolvedValue([]) } };
        const ahora = new Date('2026-11-20T16:00:00Z');
        await new AsistenciaRepository(prisma as unknown as PrismaService).findActividades('e1', ahora);
        expect(prisma.clase.findMany.mock.calls[0][0].where).toMatchObject({
            entrenadorId: 'e1', inicio: { lte: ahora }, fin: { gte: new Date('2026-11-19T16:00:00Z') },
        });
    });

    it('AC2: guarda "Asistió" o "No asistió" con la fecha, la hora y mi usuario', async () => {
        const res = await service.marcar('e1', { marcas: [marca('r1', MarcaAsistencia.NO_ASISTIO)] });

        expect(repo.marcar).toHaveBeenCalledWith([marca('r1', MarcaAsistencia.NO_ASISTIO)], 'e1', new Date('2026-11-20T16:00:00Z'));
        expect(res[0]).toMatchObject({ asistencia: 'NO_ASISTIO', registradaEn: '2026-11-20T16:00:00.000Z' });
    });

    it('AC3: puedo corregir la marca dentro de la misma ventana', async () => {
        await service.marcar('e1', { marcas: [marca('r1', MarcaAsistencia.NO_ASISTIO)] });
        enHora('2026-11-21T15:00:00Z'); // justo 24 h después del fin
        await service.marcar('e1', { marcas: [marca('r1', MarcaAsistencia.ASISTIO)] });

        expect(repo.marcar).toHaveBeenLastCalledWith([marca('r1', MarcaAsistencia.ASISTIO)], 'e1', expect.any(Date));
    });

    it('AC4: "Marcar todos como Asistió" guarda la marca de todos los miembros en una sola operación', async () => {
        const marcas = ['r1', 'r2', 'r3'].map((id) => marca(id));

        await service.marcar('e1', { marcas });

        expect(repo.marcar).toHaveBeenCalledOnce();
        expect(repo.marcar.mock.calls[0][0]).toHaveLength(3);
    });

    it('AC5: antes del inicio o más de 24 horas después del fin se rechaza con el mensaje de la ventana', async () => {
        enHora('2026-11-20T13:59:00Z');
        await expect(service.marcar('e1', { marcas: [marca('r1')] })).rejects.toThrow(new ConflictException(FUERA_DE_VENTANA));
        enHora('2026-11-21T15:01:00Z');
        await expect(service.marcar('e1', { marcas: [marca('r1')] })).rejects.toThrow(FUERA_DE_VENTANA);
        expect(repo.marcar).not.toHaveBeenCalled();
    });

    it('AC6: no se marca la actividad de otro entrenador y las reservas canceladas no se registran', async () => {
        repo.findRegistro.mockResolvedValue(registro({ entrenadorId: 'otro' }));
        await expect(service.marcar('e1', { marcas: [marca('r1')] })).rejects.toBeInstanceOf(ForbiddenException);

        repo.findRegistro.mockResolvedValue(registro({ activo: false }));
        await expect(service.marcar('e1', { marcas: [marca('r1')] })).rejects.toBeInstanceOf(ConflictException);
        expect(repo.marcar).not.toHaveBeenCalled();
        expect(rolesPermitidos(AsistenciaController, 'marcar')).toEqual([Rol.ENTRENADOR]);
    });

    it('AC7: lo marcado como "Asistió" le aparece al miembro en "Pendientes de calificar"', async () => {
        const prisma = { reserva: { findMany: vi.fn().mockResolvedValue([]) }, sesionPersonal: { findMany: vi.fn().mockResolvedValue([]) } };
        const { ResenaRepository: Repo } = await import('@Resenas/repositories');
        await new Repo(prisma as unknown as PrismaService).findPendientes('m1', new Date());
        expect(prisma.reserva.findMany.mock.calls[0][0].where).toMatchObject({ asistencia: 'ASISTIO', resena: null });

        const resenas = { findMiembroIdDeUsuario: vi.fn().mockResolvedValue('m1'), findPendientes: vi.fn().mockResolvedValue([
            { tipo: TipoActividad.CLASE, registroId: 'r1', nombre: 'Spinning', entrenador: 'Luis Gómez', fin: FIN },
        ]) };
        const lista = await new ResenasService(resenas as unknown as ResenaRepository).pendientes('u1');
        expect(lista.map((p) => p.registroId)).toEqual(['r1']);
    });
});
