import {
    MENSAJES_REPORTE,
    calcularOcupacion,
    etiquetaOcupacion,
    resolverRango,
    sumarMeses,
} from './reglas-reporte.js';

// Miércoles 18 de noviembre de 2026, 10:00 en El Salvador.
const AHORA = new Date('2026-11-18T16:00:00Z');

describe('resolverRango', () => {
    it('sin fechas: los últimos 30 días, hoy incluido', () => {
        expect(resolverRango(undefined, undefined, AHORA)).toEqual({ desde: '2026-10-20', hasta: '2026-11-18' });
    });

    it('usa la fecha de El Salvador: a las 23:00 locales sigue siendo el mismo día', () => {
        // 18/11 23:00 en El Salvador = 19/11 05:00 UTC.
        expect(resolverRango(undefined, undefined, new Date('2026-11-19T05:00:00Z'))).toMatchObject({ hasta: '2026-11-18' });
    });

    it('con una sola fecha completa 30 días', () => {
        expect(resolverRango('2026-01-01', undefined, AHORA)).toEqual({ desde: '2026-01-01', hasta: '2026-01-30' });
        expect(resolverRango(undefined, '2026-01-30', AHORA)).toEqual({ desde: '2026-01-01', hasta: '2026-01-30' });
    });

    it('acepta el mismo día y un rango de exactamente 12 meses', () => {
        expect(resolverRango('2026-05-05', '2026-05-05', AHORA)).toEqual({ desde: '2026-05-05', hasta: '2026-05-05' });
        expect(resolverRango('2026-01-01', '2026-12-31', AHORA)).toEqual({ desde: '2026-01-01', hasta: '2026-12-31' });
    });

    it('rechaza más de 12 meses', () => {
        expect(resolverRango('2026-01-01', '2027-01-01', AHORA)).toEqual({ error: MENSAJES_REPORTE.rangoMaximo });
    });

    it('rechaza inicio posterior al fin', () => {
        expect(resolverRango('2026-11-10', '2026-11-09', AHORA)).toEqual({ error: MENSAJES_REPORTE.inicioPosterior });
    });

    it('rechaza fechas que no existen', () => {
        expect(resolverRango('2026-02-30', '2026-03-10', AHORA)).toEqual({ error: MENSAJES_REPORTE.fechaInvalida });
    });
});

describe('sumarMeses', () => {
    it('suma meses y ajusta al último día del mes', () => {
        expect(sumarMeses('2026-01-15', 12)).toBe('2027-01-15');
        expect(sumarMeses('2026-01-31', 1)).toBe('2026-02-28');
        expect(sumarMeses('2027-11-30', 3)).toBe('2028-02-29');
    });
});

describe('calcularOcupacion', () => {
    it('reservas ÷ cupo total × 100 con un decimal', () => {
        expect(calcularOcupacion(7, 20)).toBe(35);
        expect(calcularOcupacion(1, 3)).toBe(33.3);
        expect(calcularOcupacion(2, 3)).toBe(66.7);
        expect(calcularOcupacion(20, 20)).toBe(100);
    });

    it('redondea half-up', () => {
        expect(calcularOcupacion(599, 2000)).toBe(30); // 29.95
    });

    it('0 si no hay cupo', () => {
        expect(calcularOcupacion(0, 0)).toBe(0);
    });
});

describe('etiquetaOcupacion', () => {
    it.each([
        [29.9, 'BAJA'],
        [30, null],
        [89.9, null],
        [90, 'ALTA'],
        [100, 'ALTA'],
        [0, 'BAJA'],
    ])('%s %% → %s', (ocupacion, etiqueta) => {
        expect(etiquetaOcupacion(ocupacion)).toBe(etiqueta);
    });
});
