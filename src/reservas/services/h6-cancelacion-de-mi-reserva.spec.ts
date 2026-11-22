import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { AvisosService } from '@Avisos/services';
import type { EstadoMembresiaService } from '@Membresias/services';
import type { ClaseRepository } from '@Clases/repositories';
import type { ReservaRepository } from '@Reservas/repositories';
import { EstadoReserva } from '@PrismaClient';
import { ReservasService } from './reservas.service.js';
import { RECHAZOS_CANCELACION, motivoDeRechazo, motivoDeRechazoCancelacion } from './reglas-reserva.js';

// Martes 10 de noviembre de 2026, 09:00 en El Salvador.
const AHORA = new Date('2026-11-10T15:00:00Z');
// La clase empieza a las 12:00 de El Salvador: 3 horas después de AHORA.
const INICIO = new Date('2026-11-10T18:00:00Z');

describe('H6. Cancelación de mi reserva', () => {
    const TX = { soyLaTransaccion: true };
    const reservaRepo = {
        findMiembroIdDeUsuario: vi.fn(),
        transaccion: vi.fn(),
        findParaCancelar: vi.fn(),
        cancelarConfirmada: vi.fn(),
        contarConfirmadasDeClase: vi.fn(),
        bloquearClase: vi.fn(),
        bloquearMembresia: vi.fn(),
        contarConfirmadasDeMembresia: vi.fn(),
        existeConfirmada: vi.fn(),
        tieneTraslape: vi.fn(),
        crear: vi.fn(),
    };
    const estadoMembresia = { obtenerEstado: vi.fn() };
    const avisos = { enviar: vi.fn() };
    const service = new ReservasService(
        reservaRepo as unknown as ReservaRepository,
        {} as unknown as ClaseRepository,
        estadoMembresia as unknown as EstadoMembresiaService,
        avisos as unknown as AvisosService,
    );

    const reserva = (datos: Record<string, unknown> = {}) => ({
        id: 'r1',
        estado: EstadoReserva.CONFIRMADA,
        claseId: 'c1',
        usuarioId: 'u1',
        inicioClase: INICIO,
        cupoMaximo: 10,
        ...datos,
    });

    beforeEach(() => {
        vi.resetAllMocks();
        reservaRepo.transaccion.mockImplementation((fn: (tx: unknown) => unknown) => fn(TX));
        reservaRepo.findParaCancelar.mockResolvedValue(reserva());
        reservaRepo.cancelarConfirmada.mockResolvedValue(true);
        reservaRepo.contarConfirmadasDeClase.mockResolvedValue(6);
    });

    it('AC1: con 2 horas o más de anticipación la reserva pasa a "Cancelada por el miembro" y sube un lugar', async () => {
        const res = await service.cancelar('u1', 'r1', AHORA);

        expect(res).toEqual({ id: 'r1', estado: EstadoReserva.CANCELADA_MIEMBRO, lugaresDisponibles: 4 });
        expect(reservaRepo.cancelarConfirmada).toHaveBeenCalledWith(TX, 'r1', new Date('2026-11-10T17:00:00Z'), AHORA);

        // Justo en el límite de 2 horas también se puede.
        reservaRepo.findParaCancelar.mockResolvedValue(reserva({ inicioClase: new Date('2026-11-10T17:00:00Z') }));
        await expect(service.cancelar('u1', 'r1', AHORA)).resolves.toMatchObject({ estado: EstadoReserva.CANCELADA_MIEMBRO });
    });

    it('AC2: en un Set de clases el crédito vuelve a estar disponible', () => {
        // Los créditos se calculan contando las reservas CONFIRMADA: con 8 de 8 no se puede reservar,
        // y después de cancelar una (7 confirmadas) el crédito vuelve a estar disponible.
        const base = {
            ahora: AHORA,
            clase: { estado: 'PROGRAMADA', inicio: new Date('2026-11-12T13:00:00Z'), tipoClaseId: 't1', cupoMaximo: 10 },
            membresia: { estado: 'VIGENTE', fechaInicio: '2026-11-01', fechaVencimiento: '2026-11-30', tiposClaseIds: ['t1'], creditosTotales: 8 },
            reservasConfirmadasDeLaClase: 0,
            yaReservada: false,
            tieneTraslape: false,
        };
        expect(motivoDeRechazo({ ...base, creditosUsados: 8 })).not.toBeNull();
        expect(motivoDeRechazo({ ...base, creditosUsados: 7 })).toBeNull();
    });

    it('AC3: después de cancelar puede volver a reservar la misma clase si tiene lugares', async () => {
        await service.cancelar('u1', 'r1', AHORA);

        reservaRepo.findMiembroIdDeUsuario.mockResolvedValue('m1');
        estadoMembresia.obtenerEstado.mockResolvedValue({
            estado: 'VIGENTE', membresiaId: 's1', fechaInicio: '2026-11-01', fechaVencimiento: '2026-11-30',
            tiposClaseIds: ['t1'], creditosTotales: null,
        });
        reservaRepo.bloquearClase.mockResolvedValue({
            id: 'c1', estado: 'PROGRAMADA', inicio: INICIO, fin: new Date('2026-11-10T19:00:00Z'),
            cupoMaximo: 10, tipoClaseId: 't1', tipo: 'Yoga', entrenador: 'Carlos Martínez',
        });
        reservaRepo.contarConfirmadasDeMembresia.mockResolvedValue(0);
        reservaRepo.existeConfirmada.mockResolvedValue(false); // la cancelada ya no cuenta
        reservaRepo.tieneTraslape.mockResolvedValue(false);
        reservaRepo.crear.mockResolvedValue({ id: 'r2' });
        avisos.enviar.mockResolvedValue({ creados: 1, omitidosPorDuplicado: 0 });

        await expect(service.reservar('u1', 'c1', AHORA)).resolves.toMatchObject({ id: 'r2', estado: EstadoReserva.CONFIRMADA });
    });

    it('AC4: con menos de 2 horas o con la clase iniciada se rechaza', async () => {
        reservaRepo.findParaCancelar.mockResolvedValue(reserva({ inicioClase: new Date('2026-11-10T16:59:00Z') }));
        await expect(service.cancelar('u1', 'r1', AHORA)).rejects.toThrow(
            new ConflictException('Solo puedes cancelar hasta 2 horas antes del inicio de la clase'),
        );
        expect(reservaRepo.cancelarConfirmada).not.toHaveBeenCalled();

        expect(
            motivoDeRechazoCancelacion({ estado: 'CONFIRMADA', inicioClase: new Date('2026-11-10T14:00:00Z'), ahora: AHORA }),
        ).toBe(RECHAZOS_CANCELACION.fueraDePlazo);
    });

    it('AC5: una reserva ya cancelada por el miembro o por el gimnasio no se puede cancelar otra vez', async () => {
        for (const estado of [EstadoReserva.CANCELADA_MIEMBRO, EstadoReserva.CANCELADA_GIMNASIO]) {
            reservaRepo.findParaCancelar.mockResolvedValue(reserva({ estado }));
            await expect(service.cancelar('u1', 'r1', AHORA)).rejects.toThrow(
                new ConflictException('Esta reserva ya fue cancelada'),
            );
        }
        expect(reservaRepo.cancelarConfirmada).not.toHaveBeenCalled();
    });

    it('AC6: la reserva de otro miembro se rechaza y no cambia', async () => {
        reservaRepo.findParaCancelar.mockResolvedValue(reserva({ usuarioId: 'otro' }));

        await expect(service.cancelar('u1', 'r1', AHORA)).rejects.toBeInstanceOf(ForbiddenException);
        expect(reservaRepo.transaccion).not.toHaveBeenCalled();
        expect(reservaRepo.cancelarConfirmada).not.toHaveBeenCalled();
    });
});
