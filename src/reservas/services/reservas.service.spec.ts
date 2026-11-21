import { BadRequestException, ConflictException, ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import type { AvisosService } from '@Avisos/services';
import type { EstadoMembresiaService } from '@Membresias/services';
import type { ClaseConRelaciones, ClaseRepository } from '@Clases/repositories';
import type { ClaseBloqueada, ReservaConClase, ReservaRepository } from '@Reservas/repositories';
import { AsistenciaReserva, EstadoClase, EstadoReserva, ModuloOrigen, Prisma } from '@PrismaClient';
import { MENSAJE_RESERVA_AJENA, MENSAJE_RESERVA_NO_EXISTE, ReservasService } from './reservas.service.js';
import { MENSAJES_RESERVA, RECHAZOS_CANCELACION, RECHAZOS_RESERVA } from './reglas-reserva.js';

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
        transaccion: vi.fn(),
        bloquearClase: vi.fn(),
        bloquearMembresia: vi.fn(),
        contarConfirmadasDeClase: vi.fn(),
        contarConfirmadasDeMembresia: vi.fn(),
        existeConfirmada: vi.fn(),
        tieneTraslape: vi.fn(),
        crear: vi.fn(),
        findParaCancelar: vi.fn(),
        cancelarConfirmada: vi.fn(),
    };
    const claseRepo = { findEntre: vi.fn(), contarReservasConfirmadas: vi.fn() };
    const estadoMembresia = { obtenerEstado: vi.fn() };
    const avisos = { enviar: vi.fn() };
    const service = new ReservasService(
        reservaRepo as unknown as ReservaRepository,
        claseRepo as unknown as ClaseRepository,
        estadoMembresia as unknown as EstadoMembresiaService,
        avisos as unknown as AvisosService,
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
            asistenciaRegistradaPorId: null,
            asistenciaRegistradaEn: null,
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

    describe('reservar (BE-5.2)', () => {
        const TX = { soyLaTransaccion: true };
        const claseBloqueada = (datos: Partial<ClaseBloqueada> = {}): ClaseBloqueada => ({
            id: 'c1',
            estado: 'PROGRAMADA',
            inicio: new Date('2026-11-11T13:00:00Z'),
            fin: new Date('2026-11-11T14:00:00Z'),
            cupoMaximo: 10,
            tipoClaseId: 't1',
            tipo: 'Yoga',
            entrenador: 'Carlos Martínez',
            ...datos,
        });

        beforeEach(() => {
            reservaRepo.transaccion.mockImplementation((fn: (tx: unknown) => unknown) => fn(TX));
            reservaRepo.bloquearClase.mockResolvedValue(claseBloqueada());
            reservaRepo.contarConfirmadasDeClase.mockResolvedValue(3);
            reservaRepo.contarConfirmadasDeMembresia.mockResolvedValue(0);
            reservaRepo.existeConfirmada.mockResolvedValue(false);
            reservaRepo.tieneTraslape.mockResolvedValue(false);
            reservaRepo.crear.mockResolvedValue({ id: 'r9' });
            estadoMembresia.obtenerEstado.mockResolvedValue({
                estado: 'VIGENTE',
                membresiaId: 's1',
                fechaInicio: '2026-11-01',
                fechaVencimiento: '2026-11-30',
                tiposClaseIds: ['t1'],
                creditosTotales: null,
            });
            avisos.enviar.mockResolvedValue({ creados: 1, omitidosPorDuplicado: 0 });
        });

        it('registra la reserva con la membresía vigente y devuelve los lugares que quedan', async () => {
            const res = await service.reservar('u1', 'c1', AHORA);

            expect(res).toEqual({ id: 'r9', estado: EstadoReserva.CONFIRMADA, lugaresDisponibles: 6 });
            expect(estadoMembresia.obtenerEstado).toHaveBeenCalledWith('m1', '2026-11-10');
            expect(reservaRepo.bloquearClase).toHaveBeenCalledWith(TX, 'c1');
            expect(reservaRepo.bloquearMembresia).toHaveBeenCalledWith(TX, 's1');
            expect(reservaRepo.crear).toHaveBeenCalledWith(TX, { claseId: 'c1', miembroId: 'm1', membresiaId: 's1' });
        });

        it('envía el aviso "Reserva confirmada" después de la transacción', async () => {
            await service.reservar('u1', 'c1', AHORA);

            expect(avisos.enviar).toHaveBeenCalledWith({
                destinatarios: ['m1'],
                moduloOrigen: ModuloOrigen.CLASES,
                referencia: 'reserva-r9-confirmada',
                titulo: 'Reserva confirmada: Yoga',
                mensaje:
                    'Tu lugar en Yoga del 11/11/2026 de 07:00 a 08:00 con Carlos Martínez quedó reservado. ' +
                    'Puedes cancelar hasta 2 horas antes del inicio.',
            });
            expect(reservaRepo.transaccion.mock.invocationCallOrder[0]).toBeLessThan(
                avisos.enviar.mock.invocationCallOrder[0],
            );
        });

        it('si el aviso falla, la reserva igual queda confirmada', async () => {
            const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
            avisos.enviar.mockRejectedValue(new Error('base caída'));
            await expect(service.reservar('u1', 'c1', AHORA)).resolves.toMatchObject({ id: 'r9' });
            expect(log).toHaveBeenCalled();
            log.mockRestore();
        });

        it('404 si la clase no existe', async () => {
            reservaRepo.bloquearClase.mockResolvedValue(null);
            await expect(service.reservar('u1', 'c1', AHORA)).rejects.toBeInstanceOf(NotFoundException);
            expect(reservaRepo.crear).not.toHaveBeenCalled();
        });

        it('409 con el motivo y sin crear nada ni avisar cuando la clase está llena', async () => {
            reservaRepo.contarConfirmadasDeClase.mockResolvedValue(10);
            await expect(service.reservar('u1', 'c1', AHORA)).rejects.toThrow(
                new ConflictException(RECHAZOS_RESERVA.llena),
            );
            expect(reservaRepo.crear).not.toHaveBeenCalled();
            expect(avisos.enviar).not.toHaveBeenCalled();
        });

        it('cuenta los créditos usados dentro de la transacción', async () => {
            estadoMembresia.obtenerEstado.mockResolvedValue({
                estado: 'VIGENTE', membresiaId: 's1', fechaInicio: '2026-11-01', fechaVencimiento: '2026-11-30',
                tiposClaseIds: ['t1'], creditosTotales: 8,
            });
            reservaRepo.contarConfirmadasDeMembresia.mockResolvedValue(8);
            await expect(service.reservar('u1', 'c1', AHORA)).rejects.toThrow(RECHAZOS_RESERVA.sinCreditos);
        });

        it('409 "Necesitas una membresía vigente" si no tiene membresía ni ficha', async () => {
            estadoMembresia.obtenerEstado.mockResolvedValue({ estado: 'SIN_MEMBRESIA', membresiaId: null });
            await expect(service.reservar('u1', 'c1', AHORA)).rejects.toThrow(RECHAZOS_RESERVA.sinMembresiaVigente);
            expect(reservaRepo.bloquearMembresia).not.toHaveBeenCalled();

            reservaRepo.findMiembroIdDeUsuario.mockResolvedValue(null);
            await expect(service.reservar('u1', 'c1', AHORA)).rejects.toThrow(RECHAZOS_RESERVA.sinMembresiaVigente);
        });

        it('convierte la violación del índice único (doble clic) en "Ya reservaste esta clase"', async () => {
            reservaRepo.crear.mockRejectedValue(
                new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' }),
            );
            await expect(service.reservar('u1', 'c1', AHORA)).rejects.toThrow(
                new ConflictException(RECHAZOS_RESERVA.yaReservada),
            );
        });
    });

    describe('cancelar (BE-6.1)', () => {
        const TX = { soyLaTransaccion: true };
        // La clase empieza a las 12:00 de El Salvador: 3 horas después de AHORA (09:00).
        const INICIO = new Date('2026-11-10T18:00:00Z');
        const reservaParaCancelar = (datos: Partial<Record<string, unknown>> = {}) => ({
            id: 'r1',
            estado: EstadoReserva.CONFIRMADA,
            claseId: 'c1',
            usuarioId: 'u1',
            inicioClase: INICIO,
            cupoMaximo: 10,
            ...datos,
        });

        beforeEach(() => {
            reservaRepo.transaccion.mockImplementation((fn: (tx: unknown) => unknown) => fn(TX));
            reservaRepo.findParaCancelar.mockResolvedValue(reservaParaCancelar());
            reservaRepo.cancelarConfirmada.mockResolvedValue(true);
            reservaRepo.contarConfirmadasDeClase.mockResolvedValue(6);
        });

        it('cancela la reserva propia y devuelve los lugares que quedan en la clase', async () => {
            const res = await service.cancelar('u1', 'r1', AHORA);

            expect(res).toEqual({ id: 'r1', estado: EstadoReserva.CANCELADA_MIEMBRO, lugaresDisponibles: 4 });
            expect(reservaRepo.contarConfirmadasDeClase).toHaveBeenCalledWith(TX, 'c1');
        });

        it('condiciona el UPDATE al límite de ahora + 2 horas y guarda la fecha de cancelación', async () => {
            await service.cancelar('u1', 'r1', AHORA);

            expect(reservaRepo.cancelarConfirmada).toHaveBeenCalledWith(
                TX,
                'r1',
                new Date('2026-11-10T17:00:00Z'),
                AHORA,
            );
        });

        it('acepta una clase que empieza en 2 horas exactas', async () => {
            reservaRepo.findParaCancelar.mockResolvedValue(
                reservaParaCancelar({ inicioClase: new Date('2026-11-10T17:00:00Z') }),
            );
            await expect(service.cancelar('u1', 'r1', AHORA)).resolves.toMatchObject({
                estado: EstadoReserva.CANCELADA_MIEMBRO,
            });
        });

        it('409 con 1 hora 59 minutos de anticipación, sin tocar la reserva', async () => {
            reservaRepo.findParaCancelar.mockResolvedValue(
                reservaParaCancelar({ inicioClase: new Date('2026-11-10T16:59:00Z') }),
            );
            await expect(service.cancelar('u1', 'r1', AHORA)).rejects.toThrow(
                new ConflictException(RECHAZOS_CANCELACION.fueraDePlazo),
            );
            expect(reservaRepo.cancelarConfirmada).not.toHaveBeenCalled();
        });

        it.each([EstadoReserva.CANCELADA_MIEMBRO, EstadoReserva.CANCELADA_GIMNASIO])(
            '409 "Esta reserva ya fue cancelada" si está %s',
            async (estado) => {
                reservaRepo.findParaCancelar.mockResolvedValue(reservaParaCancelar({ estado }));
                await expect(service.cancelar('u1', 'r1', AHORA)).rejects.toThrow(
                    new ConflictException(RECHAZOS_CANCELACION.yaCancelada),
                );
                expect(reservaRepo.cancelarConfirmada).not.toHaveBeenCalled();
            },
        );

        it('404 si la reserva no existe', async () => {
            reservaRepo.findParaCancelar.mockResolvedValue(null);
            await expect(service.cancelar('u1', 'r1', AHORA)).rejects.toThrow(
                new NotFoundException(MENSAJE_RESERVA_NO_EXISTE),
            );
        });

        it('403 si la reserva es de otro miembro, y la reserva no cambia', async () => {
            reservaRepo.findParaCancelar.mockResolvedValue(reservaParaCancelar({ usuarioId: 'otro' }));
            await expect(service.cancelar('u1', 'r1', AHORA)).rejects.toThrow(
                new ForbiddenException(MENSAJE_RESERVA_AJENA),
            );
            expect(reservaRepo.cancelarConfirmada).not.toHaveBeenCalled();
        });

        it('doble clic: si otra petición la canceló primero, responde "ya fue cancelada"', async () => {
            reservaRepo.cancelarConfirmada.mockResolvedValue(false);
            reservaRepo.findParaCancelar
                .mockResolvedValueOnce(reservaParaCancelar())
                .mockResolvedValueOnce(reservaParaCancelar({ estado: EstadoReserva.CANCELADA_MIEMBRO }));

            await expect(service.cancelar('u1', 'r1', AHORA)).rejects.toThrow(
                new ConflictException(RECHAZOS_CANCELACION.yaCancelada),
            );
            expect(reservaRepo.contarConfirmadasDeClase).not.toHaveBeenCalled();
        });

        it('si la clase se movió a menos de 2 horas entre la lectura y el UPDATE, da el motivo del plazo', async () => {
            reservaRepo.cancelarConfirmada.mockResolvedValue(false);
            reservaRepo.findParaCancelar
                .mockResolvedValueOnce(reservaParaCancelar())
                .mockResolvedValueOnce(reservaParaCancelar({ inicioClase: new Date('2026-11-10T16:00:00Z') }));

            await expect(service.cancelar('u1', 'r1', AHORA)).rejects.toThrow(
                new ConflictException(RECHAZOS_CANCELACION.fueraDePlazo),
            );
        });
    });
});
