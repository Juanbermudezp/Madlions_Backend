import { MINIMO_RESENAS, promedioPublicable } from './reglas-calificaciones.js';

describe('promedioPublicable', () => {
    it('el umbral son 3 reseñas', () => {
        expect(MINIMO_RESENAS).toBe(3);
    });

    describe('umbral exacto', () => {
        it('con 0 reseñas no hay promedio', () => {
            expect(promedioPublicable(null, 0)).toBeNull();
        });

        it('con 1 y con 2 tampoco (criterio 3)', () => {
            expect(promedioPublicable(5, 1)).toBeNull();
            expect(promedioPublicable(4.5, 2)).toBeNull();
        });

        it('con 3 ya se publica', () => {
            expect(promedioPublicable(4.5, 3)).toBe(4.5);
        });

        it('con más de 3 también', () => {
            expect(promedioPublicable(3.8, 10)).toBe(3.8);
        });
    });

    it('redondea a un decimal', () => {
        expect(promedioPublicable(4.25, 4)).toBe(4.3);
        expect(promedioPublicable(4.24, 4)).toBe(4.2);
        expect(promedioPublicable(10 / 3, 3)).toBe(3.3);
    });

    it('un promedio entero queda entero', () => {
        expect(promedioPublicable(5, 5)).toBe(5);
    });

    it('sin promedio no inventa uno, aunque haya reseñas', () => {
        // Pasa cuando las 3 reseñas omitieron ese aspecto: _avg devuelve null.
        expect(promedioPublicable(null, 3)).toBeNull();
    });
});
