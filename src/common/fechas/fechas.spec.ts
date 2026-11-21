import { hoyLocal, lunesDe, rangoDeSemana } from './fechas.js';

describe('fechas', () => {
    it('usa la fecha de El Salvador aunque en UTC ya sea el día siguiente', () => {
        // 3:00 UTC del día 10 = 21:00 del día 9 en El Salvador
        expect(hoyLocal(new Date('2026-11-10T03:00:00Z'))).toBe('2026-11-09');
    });

    it.each(['2026-11-09', '2026-11-12', '2026-11-15'])(
        'el lunes de la semana de %s es 2026-11-09',
        (fecha) => {
            expect(lunesDe(fecha)).toBe('2026-11-09');
        },
    );

    it('la semana va de lunes 00:00 a lunes siguiente 00:00 en El Salvador', () => {
        expect(rangoDeSemana('2026-11-12')).toEqual({
            desde: new Date('2026-11-09T06:00:00Z'),
            hasta: new Date('2026-11-16T06:00:00Z'),
        });
    });
});