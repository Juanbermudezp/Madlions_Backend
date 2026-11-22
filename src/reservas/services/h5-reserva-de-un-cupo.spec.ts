import { ConflictException } from '@nestjs/common';
import type { AvisosService } from '@Avisos/services';
import type { EstadoMembresiaService } from '@Membresias/services';
import type { ClaseConRelaciones, ClaseRepository } from '@Clases/repositories';
import type { ClaseBloqueada, ReservaRepository } from '@Reservas/repositories';
import { EstadoClase, EstadoReserva, ModuloOrigen } from '@PrismaClient';
import { ReservasService } from './reservas.service.js';
import { RECHAZOS_RESERVA, motivoDeRechazo, type DatosReserva } from './reglas-reserva.js';

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

/** Datos de una reserva que cumple todas las reglas de H5. */
function datosValidos(cambios: Partial<DatosReserva> = {}): DatosReserva {
    return {
        ahora: AHORA,
        clase: { estado: 'PROGRAMADA', inicio: new Date('2026-11-11T13:00:00Z'), tipoClaseId: 't1', cupoMaximo: 10 },
        membresia: {
            estado: 'VIGENTE',
            fechaInicio: '2026-11-01',
            fechaVencimiento: '2026-11-30',
            tiposClaseIds: ['t1'],
            creditosTotales: null,
        },
        creditosUsados: 0,
        reservasConfirmadasDeLaClase: 3,
        yaReservada: false,
        tieneTraslape: false,
        ...cambios,
    };
}

describe('H5. Reserva de un cupo', () => {
    const TX = { soyLaTransaccion: true };
    const reservaRepo = {
        findMiembroIdDeUsuario: vi.fn(),
        findClasesReservadasPor: vi.fn(),
        transaccion: vi.fn(),
        bloquearClase: vi.fn(),
        bloquearMembresia: vi.fn(),
        contarConfirmadasDeClase: vi.fn(),
        contarConfirmadasDeMembresia: vi.fn(),
        existeConfirmada: vi.fn(),
        tieneTraslape: vi.fn(),
        crear: vi.fn(),
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
        vi.resetAllMocks();
        reservaRepo.findMiembroIdDeUsuario.mockResolvedValue('m1');
        reservaRepo.findClasesReservadasPor.mockResolvedValue(new Set());
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

    it('AC1: lista solo las clases programadas de la semana que aún no empiezan y permite pasar a la semana siguiente', async () => {
        claseRepo.findEntre.mockResolvedValue([
            clase({ id: 'pasada', inicio: new Date('2026-11-10T13:00:00Z'), fin: new Date('2026-11-10T14:00:00Z') }),
            clase({ id: 'cancelada', estado: EstadoClase.CANCELADA_GIMNASIO }),
            clase({ id: 'futura' }),
        ]);
        claseRepo.contarReservasConfirmadas.mockResolvedValue(new Map([['futura', 3]]));

        const res = await service.listarReservables('u1', undefined, AHORA);
        expect(res.map((c) => c.id)).toEqual(['futura']);

        claseRepo.findEntre.mockResolvedValue([]);
        await service.listarReservables('u1', '2026-11-18', AHORA);
        expect(claseRepo.findEntre).toHaveBeenLastCalledWith(
            new Date('2026-11-16T06:00:00Z'),
            new Date('2026-11-23T06:00:00Z'),
        );
    });

    it('AC2: sin clases programadas en la semana devuelve una lista vacía', async () => {
        claseRepo.findEntre.mockResolvedValue([]);
        await expect(service.listarReservables('u1', undefined, AHORA)).resolves.toEqual([]);
    });

    it('AC3: cada clase trae tipo, entrenador, horario y lugares disponibles', async () => {
        claseRepo.findEntre.mockResolvedValue([clase()]);
        claseRepo.contarReservasConfirmadas.mockResolvedValue(new Map([['c1', 4]]));

        const [c] = await service.listarReservables('u1', undefined, AHORA);

        expect(c.tipo).toEqual({ id: 't1', nombre: 'Yoga' });
        expect(c.entrenador).toEqual({ id: 'e1', nombre: 'Carlos Martínez' });
        expect(c.inicio).toEqual(new Date('2026-11-11T13:00:00Z'));
        expect(c.fin).toEqual(new Date('2026-11-11T14:00:00Z'));
        expect(c.lugaresDisponibles).toBe(6);
    });

    it('AC4: con membresía vigente que incluye el tipo y cubre la fecha, la reserva queda confirmada y baja un lugar', async () => {
        const res = await service.reservar('u1', 'c1', AHORA);

        expect(res).toEqual({ id: 'r9', estado: EstadoReserva.CONFIRMADA, lugaresDisponibles: 6 });
        expect(reservaRepo.crear).toHaveBeenCalledWith(TX, { claseId: 'c1', miembroId: 'm1', membresiaId: 's1' });
    });

    it('AC5: en un Set de clases cada reserva compromete un crédito y sin créditos se rechaza', async () => {
        expect(motivoDeRechazo(datosValidos({ membresia: { ...datosValidos().membresia, creditosTotales: 8 }, creditosUsados: 7 }))).toBeNull();

        estadoMembresia.obtenerEstado.mockResolvedValue({
            estado: 'VIGENTE', membresiaId: 's1', fechaInicio: '2026-11-01', fechaVencimiento: '2026-11-30',
            tiposClaseIds: ['t1'], creditosTotales: 8,
        });
        reservaRepo.contarConfirmadasDeMembresia.mockResolvedValue(8);

        await expect(service.reservar('u1', 'c1', AHORA)).rejects.toThrow(
            new ConflictException('No te quedan clases disponibles en tu plan'),
        );
        expect(reservaRepo.contarConfirmadasDeMembresia).toHaveBeenCalledWith(TX, 's1');
        expect(reservaRepo.crear).not.toHaveBeenCalled();
    });

    it('AC6: rechaza si ya tiene una reserva confirmada en la clase o una actividad que se traslapa', () => {
        expect(motivoDeRechazo(datosValidos({ yaReservada: true }))).toBe(RECHAZOS_RESERVA.yaReservada);
        expect(motivoDeRechazo(datosValidos({ tieneTraslape: true }))).toBe(RECHAZOS_RESERVA.traslape);
    });

    it('AC7: el último lugar se decide con la clase bloqueada; el segundo miembro ve "La clase está llena"', async () => {
        // Primer miembro: quedaba 1 lugar.
        reservaRepo.contarConfirmadasDeClase.mockResolvedValueOnce(9);
        await expect(service.reservar('u1', 'c1', AHORA)).resolves.toMatchObject({ lugaresDisponibles: 0 });

        // Segundo miembro: al obtener el bloqueo ya ve las 10 confirmadas.
        reservaRepo.contarConfirmadasDeClase.mockResolvedValueOnce(10);
        await expect(service.reservar('u2', 'c1', AHORA)).rejects.toThrow(new ConflictException('La clase está llena'));

        expect(reservaRepo.bloquearClase).toHaveBeenCalledWith(TX, 'c1');
        expect(reservaRepo.crear).toHaveBeenCalledTimes(1);
    });

    it('AC8: rechaza clase no programada, ya iniciada, llena, tipo no incluido o fuera de cobertura sin cambiar cupos ni créditos', async () => {
        expect(motivoDeRechazo(datosValidos({ clase: { ...datosValidos().clase, estado: 'CANCELADA_GIMNASIO' } }))).toBe(
            RECHAZOS_RESERVA.noDisponible,
        );
        expect(motivoDeRechazo(datosValidos({ clase: { ...datosValidos().clase, inicio: new Date('2026-11-10T14:00:00Z') } }))).toBe(
            RECHAZOS_RESERVA.noDisponible,
        );
        expect(motivoDeRechazo(datosValidos({ reservasConfirmadasDeLaClase: 10 }))).toBe(RECHAZOS_RESERVA.llena);
        expect(motivoDeRechazo(datosValidos({ membresia: { ...datosValidos().membresia, tiposClaseIds: ['t2'] } }))).toBe(
            RECHAZOS_RESERVA.tipoNoIncluido,
        );
        expect(motivoDeRechazo(datosValidos({ membresia: { ...datosValidos().membresia, fechaVencimiento: '2026-11-10' } }))).toBe(
            RECHAZOS_RESERVA.fueraDeCobertura,
        );

        reservaRepo.bloquearClase.mockResolvedValue(claseBloqueada({ tipoClaseId: 't2' }));
        await expect(service.reservar('u1', 'c1', AHORA)).rejects.toThrow(RECHAZOS_RESERVA.tipoNoIncluido);
        expect(reservaRepo.crear).not.toHaveBeenCalled();
    });

    it('AC9: al confirmar envía el aviso "Reserva confirmada" por el servicio de avisos', async () => {
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
    });
});
