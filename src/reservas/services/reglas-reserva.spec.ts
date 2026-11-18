import {
    MENSAJES_RESERVA,
    RECHAZOS_RESERVA,
    avisoReservaConfirmada,
    motivoDeRechazo,
    semanaReservable,
    type DatosReserva,
} from './reglas-reserva.js';

// Martes 10 de noviembre de 2026, 09:00 en El Salvador.
const AHORA = new Date('2026-11-10T15:00:00Z');

describe('semanaReservable (BE-5.1)', () => {
    it('sin semana devuelve el lunes de la semana actual', () => {
        expect(semanaReservable(undefined, AHORA)).toEqual({ lunes: '2026-11-09' });
    });

    it('acepta cualquier día de la semana actual', () => {
        expect(semanaReservable('2026-11-15', AHORA)).toEqual({ lunes: '2026-11-09' });
    });

    it('acepta la semana siguiente', () => {
        expect(semanaReservable('2026-11-16', AHORA)).toEqual({ lunes: '2026-11-16' });
        expect(semanaReservable('2026-11-22', AHORA)).toEqual({ lunes: '2026-11-16' });
    });

    it('rechaza la semana anterior y la de dentro de dos semanas', () => {
        expect(semanaReservable('2026-11-08', AHORA)).toEqual({ error: MENSAJES_RESERVA.semanaFueraDeRango });
        expect(semanaReservable('2026-11-23', AHORA)).toEqual({ error: MENSAJES_RESERVA.semanaFueraDeRango });
    });

    it('rechaza una fecha que no existe', () => {
        expect(semanaReservable('2026-02-30', AHORA)).toEqual({ error: MENSAJES_RESERVA.semanaInvalida });
    });

    it('usa la fecha de El Salvador: el domingo a las 23:00 locales sigue siendo la misma semana', () => {
        // Domingo 15 de noviembre, 23:00 en El Salvador = lunes 16, 05:00 UTC.
        const domingoNoche = new Date('2026-11-16T05:00:00Z');
        expect(semanaReservable(undefined, domingoNoche)).toEqual({ lunes: '2026-11-09' });
    });
});

describe('motivoDeRechazo (BE-5.2)', () => {
    // Clase del miércoles 11 de noviembre, 07:00 a 08:00 en El Salvador.
    const base = (): DatosReserva => ({
        ahora: AHORA,
        clase: {
            estado: 'PROGRAMADA',
            inicio: new Date('2026-11-11T13:00:00Z'),
            tipoClaseId: 'yoga',
            cupoMaximo: 10,
        },
        membresia: {
            estado: 'VIGENTE',
            fechaInicio: '2026-11-01',
            fechaVencimiento: '2026-11-30',
            tiposClaseIds: ['yoga', 'spinning'],
            creditosTotales: null,
        },
        creditosUsados: 0,
        reservasConfirmadasDeLaClase: 3,
        yaReservada: false,
        tieneTraslape: false,
    });
    const con = (cambios: (d: DatosReserva) => void) => {
        const d = base();
        cambios(d);
        return motivoDeRechazo(d);
    };

    it('acepta una reserva válida', () => {
        expect(motivoDeRechazo(base())).toBeNull();
    });

    it('acepta una membresía Próxima a vencer', () => {
        expect(con((d) => (d.membresia.estado = 'PROXIMA_A_VENCER'))).toBeNull();
    });

    it('rechaza una clase cancelada o que ya empezó', () => {
        expect(con((d) => (d.clase.estado = 'CANCELADA_GIMNASIO'))).toBe(RECHAZOS_RESERVA.noDisponible);
        expect(con((d) => (d.clase.inicio = AHORA))).toBe(RECHAZOS_RESERVA.noDisponible);
    });

    it.each(['VENCIDA', 'PENDIENTE_PAGO', 'POR_INICIAR', 'SIN_MEMBRESIA'])(
        'rechaza una membresía %s',
        (estado) => {
            expect(con((d) => (d.membresia.estado = estado))).toBe(RECHAZOS_RESERVA.sinMembresiaVigente);
        },
    );

    it('rechaza una clase después del vencimiento, pero acepta el mismo día del vencimiento', () => {
        expect(con((d) => (d.membresia.fechaVencimiento = '2026-11-10'))).toBe(RECHAZOS_RESERVA.fueraDeCobertura);
        expect(con((d) => (d.membresia.fechaVencimiento = '2026-11-11'))).toBeNull();
    });

    it('compara con la fecha de El Salvador: una clase a las 19:00 del día de vencimiento está cubierta', () => {
        // 19:00 del 11 de noviembre en El Salvador = 01:00 del 12 en UTC.
        expect(
            con((d) => {
                d.clase.inicio = new Date('2026-11-12T01:00:00Z');
                d.membresia.fechaVencimiento = '2026-11-11';
            }),
        ).toBeNull();
    });

    it('rechaza un tipo de clase que el plan no incluye', () => {
        expect(con((d) => (d.clase.tipoClaseId = 'crossfit'))).toBe(RECHAZOS_RESERVA.tipoNoIncluido);
    });

    it('rechaza una reserva duplicada y un traslape', () => {
        expect(con((d) => (d.yaReservada = true))).toBe(RECHAZOS_RESERVA.yaReservada);
        expect(con((d) => (d.tieneTraslape = true))).toBe(RECHAZOS_RESERVA.traslape);
    });

    it('en un set rechaza cuando ya no quedan créditos', () => {
        expect(con((d) => { d.membresia.creditosTotales = 8; d.creditosUsados = 7; })).toBeNull();
        expect(con((d) => { d.membresia.creditosTotales = 8; d.creditosUsados = 8; })).toBe(RECHAZOS_RESERVA.sinCreditos);
    });

    it('rechaza una clase llena y acepta el último lugar', () => {
        expect(con((d) => (d.reservasConfirmadasDeLaClase = 9))).toBeNull();
        expect(con((d) => (d.reservasConfirmadasDeLaClase = 10))).toBe(RECHAZOS_RESERVA.llena);
    });

    it('muestra al miembro su propio motivo antes que "llena"', () => {
        expect(con((d) => { d.reservasConfirmadasDeLaClase = 10; d.clase.tipoClaseId = 'crossfit'; }))
            .toBe(RECHAZOS_RESERVA.tipoNoIncluido);
    });
});

describe('avisoReservaConfirmada (criterio 9 de H5)', () => {
    it('arma el título y el mensaje con fecha y horas de El Salvador', () => {
        expect(
            avisoReservaConfirmada({
                tipo: 'Yoga',
                entrenador: 'Carlos Martínez',
                inicio: new Date('2026-11-19T00:00:00Z'), // 18/11 18:00 en El Salvador
                fin: new Date('2026-11-19T01:00:00Z'),
            }),
        ).toEqual({
            titulo: 'Reserva confirmada: Yoga',
            mensaje:
                'Tu lugar en Yoga del 18/11/2026 de 18:00 a 19:00 con Carlos Martínez quedó reservado. ' +
                'Puedes cancelar hasta 2 horas antes del inicio.',
        });
    });
});
