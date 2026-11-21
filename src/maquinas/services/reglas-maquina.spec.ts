import { EstadoMaquina, Rol } from '@PrismaClient';
import {
    errorDeFechaEstimada,
    esMismoEstado,
    fechaEstimadaTrasElCambio,
    puedeVerDatosInternos,
    FECHA_RETORNO_EN_OPERATIVA,
    FECHA_RETORNO_PASADA,
} from './reglas-maquina.js';

describe('puedeVerDatosInternos', () => {
    it('el administrador y el entrenador ven los datos internos', () => {
        expect(puedeVerDatosInternos(Rol.ADMINISTRADOR)).toBe(true);
        expect(puedeVerDatosInternos(Rol.ENTRENADOR)).toBe(true);
    });

    it('el miembro y recepción no los ven', () => {
        expect(puedeVerDatosInternos(Rol.MIEMBRO)).toBe(false);
        expect(puedeVerDatosInternos(Rol.RECEPCION)).toBe(false);
    });
});

describe('esMismoEstado', () => {
    it('detecta el cambio al estado en el que ya está (criterio 4)', () => {
        expect(esMismoEstado(EstadoMaquina.OPERATIVA, EstadoMaquina.OPERATIVA)).toBe(true);
        expect(
            esMismoEstado(EstadoMaquina.EN_MANTENIMIENTO, EstadoMaquina.EN_MANTENIMIENTO),
        ).toBe(true);
    });

    it('acepta dos estados distintos', () => {
        expect(esMismoEstado(EstadoMaquina.OPERATIVA, EstadoMaquina.EN_MANTENIMIENTO)).toBe(false);
        expect(
            esMismoEstado(EstadoMaquina.FUERA_DE_SERVICIO, EstadoMaquina.OPERATIVA),
        ).toBe(false);
    });
});

describe('errorDeFechaEstimada', () => {
    const HOY = '2026-11-18';

    it('acepta que no se mande fecha, en cualquier estado', () => {
        for (const estado of Object.values(EstadoMaquina)) {
            expect(errorDeFechaEstimada(estado, undefined, HOY)).toBeNull();
        }
    });

    it('acepta hoy y cualquier día posterior', () => {
        expect(errorDeFechaEstimada(EstadoMaquina.EN_MANTENIMIENTO, HOY, HOY)).toBeNull();
        expect(
            errorDeFechaEstimada(EstadoMaquina.FUERA_DE_SERVICIO, '2027-01-01', HOY),
        ).toBeNull();
    });

    it('rechaza la fecha de ayer (criterio 4)', () => {
        expect(errorDeFechaEstimada(EstadoMaquina.EN_MANTENIMIENTO, '2026-11-17', HOY)).toBe(
            FECHA_RETORNO_PASADA,
        );
    });

    it('rechaza la fecha estimada al volver a OPERATIVA (criterio 4)', () => {
        expect(errorDeFechaEstimada(EstadoMaquina.OPERATIVA, '2027-01-01', HOY)).toBe(
            FECHA_RETORNO_EN_OPERATIVA,
        );
    });

    it('al volver a OPERATIVA la fecha pasada también se rechaza por el estado', () => {
        expect(errorDeFechaEstimada(EstadoMaquina.OPERATIVA, '2026-11-17', HOY)).toBe(
            FECHA_RETORNO_EN_OPERATIVA,
        );
    });
});

describe('fechaEstimadaTrasElCambio', () => {
    it('guarda la fecha enviada al salir de OPERATIVA', () => {
        expect(
            fechaEstimadaTrasElCambio(EstadoMaquina.EN_MANTENIMIENTO, '2026-12-01'),
        ).toEqual(new Date('2026-12-01T00:00:00Z'));
    });

    it('deja la fecha nula si no se envió', () => {
        expect(fechaEstimadaTrasElCambio(EstadoMaquina.FUERA_DE_SERVICIO, undefined)).toBeNull();
    });

    it('borra la fecha estimada al volver a OPERATIVA (criterio 2)', () => {
        expect(fechaEstimadaTrasElCambio(EstadoMaquina.OPERATIVA, undefined)).toBeNull();
    });
});
