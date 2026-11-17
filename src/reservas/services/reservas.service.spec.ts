import { BadRequestException } from '@nestjs/common';
import type { ClaseConRelaciones, ClaseRepository } from '@Clases/repositories';
import type { ReservaConClase, ReservaRepository } from '@Reservas/repositories';
import { AsistenciaReserva, EstadoClase, EstadoReserva } from '@PrismaClient';
import { ReservasService } from './reservas.service.js';
import { MENSAJES_RESERVA } from './reglas-reserva.js';

// Martes 10 de noviembre de 2026, 09:00 en El Salvador.
const AHORA = new Date('2026-11-10T15:00:00Z');

function clase(datos: Partial<ClaseConRelaciones> = {}): ClaseConRelaciones {
    return {
        id: 'c1',
        tipoClaseId: 't1',
        entrenadorId: 'e1',
        descripcion: null,
        inicio: new Date('2026-11-11T13:00:00Z'), // miércoles 07:00
        fin: new Date('2026-11-11T14:00:00Z'),
        cupoMaximo: 10,
        estado: EstadoClase.PROGRAMADA,
        creadoEn: AHORA,
        tipoClase: { id: 't1', nombre: 'Yoga', descripcion: 'x', activo: true, creadoEn: AHORA },
        entrenador: { id: 'e1', nombre: 'Carlos', apellido: 'Martínez' },
        ...datos,
    } as ClaseConRelaciones;
}

describe('ReservasService (BE-5.1)', () => {
    const reservaRepo = {
        findMiembroIdDeUsuario: vi.fn(),
        findClasesReservadasPor: vi.fn(),
        findDelMiembro: vi.fn(),
    };
    const claseRepo = { findEntre: vi.fn(), contarReservasConfirmadas: vi.fn() };
    const service = new ReservasService(
        reservaRepo as unknown as ReservaRepository,
        claseRepo as unknown as ClaseRepository,
    );

    beforeEach(() => {
        vi.resetAllMocks();
        reservaRepo.findMiembroIdDeUsuario.mockResolvedValue('m1');
    });

    describe('listarReservables', () => {
        it('solo devuelve clases PROGRAMADAS que aún no empiezan', async () => {
            claseRepo.findEntre.mockResolvedValue([
                clase({ id: 'pasada', inicio: new Date('2026-11-10T13:00:00Z'), fin: new Date('2026-11-10T14:00:00Z') }),
                clase({ id: 'cancelada', estado: EstadoClase.CANCELADA_GIMNASIO }),
                clase({ id: 'futura' }),
            ]);
            claseRepo.contarReservasConfirmadas.mockResolvedValue(new Map([['futura', 3]]));
            reservaRepo.findClasesReservadasPor.mockResolvedValue(new Set());

            const res = await service.listarReservables('u1', undefined, AHORA);

            expect(res.map((c) => c.id)).toEqual(['futura']);
            expect(claseRepo.contarReservasConfirmadas).toHaveBeenCalledWith(['futura']);
        });

        it('calcula los lugares disponibles y marca las clases ya reservadas', async () => {
            claseRepo.findEntre.mockResolvedValue([clase({ id: 'a' }), clase({ id: 'b', cupoMaximo: 5 })]);
            claseRepo.contarReservasConfirmadas.mockResolvedValue(new Map([['a', 2], ['b', 5]]));
            reservaRepo.findClasesReservadasPor.mockResolvedValue(new Set(['a']));

            const [a, b] = await service.listarReservables('u1', undefined, AHORA);

            expect(a).toMatchObject({ id: 'a', lugaresDisponibles: 8, yaReservada: true });
            expect(b).toMatchObject({ id: 'b', lugaresDisponibles: 0, yaReservada: false });
            expect(a.entrenador).toEqual({ id: 'e1', nombre: 'Carlos Martínez' });
        });

        it('consulta la semana pedida (la siguiente)', async () => {
            claseRepo.findEntre.mockResolvedValue([]);
            await service.listarReservables('u1', '2026-11-18', AHORA);
            expect(claseRepo.findEntre).toHaveBeenCalledWith(
                new Date('2026-11-16T06:00:00Z'),
                new Date('2026-11-23T06:00:00Z'),
            );
        });

        it('rechaza una semana fuera de rango con 400', async () => {
            await expect(service.listarReservables('u1', '2026-11-30', AHORA)).rejects.toThrow(
                new BadRequestException(MENSAJES_RESERVA.semanaFueraDeRango),
            );
            expect(claseRepo.findEntre).not.toHaveBeenCalled();
        });

        it('un usuario sin ficha de miembro no tiene clases reservadas', async () => {
            reservaRepo.findMiembroIdDeUsuario.mockResolvedValue(null);
            claseRepo.findEntre.mockResolvedValue([clase()]);
            claseRepo.contarReservasConfirmadas.mockResolvedValue(new Map());

            const [c] = await service.listarReservables('u1', undefined, AHORA);

            expect(c.yaReservada).toBe(false);
            expect(reservaRepo.findClasesReservadasPor).not.toHaveBeenCalled();
        });
    });

    describe('listarMias', () => {
        const reserva = (datos: Partial<ReservaConClase> = {}): ReservaConClase => ({
            id: 'r1',
            claseId: 'c1',
            miembroId: 'm1',
            membresiaId: 's1',
            estado: EstadoReserva.CONFIRMADA,
            asistencia: AsistenciaReserva.SIN_REGISTRAR,
            creadaEn: AHORA,
            canceladaEn: null,
            clase: clase(),
            ...datos,
        });

        it('busca las reservas del miembro del token en la pestaña pedida', async () => {
            reservaRepo.findDelMiembro.mockResolvedValue([reserva()]);

            const res = await service.listarMias('u1', 'pasadas', AHORA);

            expect(reservaRepo.findMiembroIdDeUsuario).toHaveBeenCalledWith('u1');
            expect(reservaRepo.findDelMiembro).toHaveBeenCalledWith('m1', 'pasadas', AHORA);
            expect(res[0]).toMatchObject({
                id: 'r1',
                estado: EstadoReserva.CONFIRMADA,
                clase: { id: 'c1', tipo: { nombre: 'Yoga' }, estado: EstadoClase.PROGRAMADA },
            });
        });

        it('por defecto muestra las próximas', async () => {
            reservaRepo.findDelMiembro.mockResolvedValue([]);
            await service.listarMias('u1', undefined, AHORA);
            expect(reservaRepo.findDelMiembro).toHaveBeenCalledWith('m1', 'proximas', AHORA);
        });

        it('muestra IMPARTIDA en una clase programada que ya terminó', async () => {
            const terminada = clase({ fin: new Date('2026-11-09T14:00:00Z') });
            reservaRepo.findDelMiembro.mockResolvedValue([reserva({ clase: terminada })]);
            const [r] = await service.listarMias('u1', 'pasadas', AHORA);
            expect(r.clase.estado).toBe('IMPARTIDA');
        });

        it('un usuario sin ficha de miembro no tiene reservas', async () => {
            reservaRepo.findMiembroIdDeUsuario.mockResolvedValue(null);
            expect(await service.listarMias('u1', 'proximas', AHORA)).toEqual([]);
            expect(reservaRepo.findDelMiembro).not.toHaveBeenCalled();
        });
    });
});
