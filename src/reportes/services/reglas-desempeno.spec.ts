import { MINIMO_RESENAS } from '@Estadisticas/services';
import type { FilaOcupacion } from '@Reportes/repositories';
import { MINIMO_RESENAS_DESEMPENO, armarDesempeno } from './reglas-desempeno.js';

const ANA = { id: 'e-ana', nombre: 'Ana López' };
const LUIS = { id: 'e-luis', nombre: 'Luis Pérez' };

const fila = (entrenadorId: string, datos: Partial<FilaOcupacion>): FilaOcupacion => ({
    tipoClaseId: 't-1',
    tipoClase: 'Yoga',
    entrenadorId,
    entrenador: '',
    vecesImpartida: 1,
    reservasConfirmadas: 0,
    cupoTotal: 10,
    ...datos,
});

describe('armarDesempeno', () => {
    it('usa el mismo mínimo de reseñas que H21', () => {
        expect(MINIMO_RESENAS_DESEMPENO).toBe(MINIMO_RESENAS);
    });

    it('suma las clases de todos los tipos y aplica la fórmula de ocupación de H26', () => {
        const [ana] = armarDesempeno(
            [ANA],
            [
                fila(ANA.id, { vecesImpartida: 2, reservasConfirmadas: 3, cupoTotal: 20 }),
                fila(ANA.id, { tipoClaseId: 't-2', vecesImpartida: 1, reservasConfirmadas: 9, cupoTotal: 10 }),
                fila(LUIS.id, { vecesImpartida: 5, reservasConfirmadas: 50, cupoTotal: 50 }),
            ],
            new Map(),
            new Map(),
        );

        // (3 + 9) ÷ (20 + 10) × 100 = 40 %
        expect(ana).toMatchObject({ clasesImpartidas: 3, ocupacionPromedio: 40 });
    });

    it('sin clases impartidas la ocupación es null y las métricas en 0', () => {
        expect(armarDesempeno([LUIS], [], new Map(), new Map())).toEqual([
            {
                entrenador: LUIS,
                clasesImpartidas: 0,
                ocupacionPromedio: null,
                sesionesRealizadas: 0,
                calificacion: null,
                resenas: 0,
            },
        ]);
    });

    it('cuenta las sesiones realizadas del entrenador', () => {
        const [ana] = armarDesempeno([ANA], [], new Map([[ANA.id, 4]]), new Map());

        expect(ana.sesionesRealizadas).toBe(4);
    });

    it('con 2 reseñas la calificación es null ("Sin datos suficientes")', () => {
        const [ana] = armarDesempeno(
            [ANA],
            [],
            new Map(),
            new Map([[ANA.id, { entrenadorId: ANA.id, promedio: 5, total: 2 }]]),
        );

        expect(ana).toMatchObject({ calificacion: null, resenas: 2 });
    });

    it('con 3 reseñas publica el promedio con un decimal', () => {
        const [ana] = armarDesempeno(
            [ANA],
            [],
            new Map(),
            new Map([[ANA.id, { entrenadorId: ANA.id, promedio: 13 / 3, total: 3 }]]),
        );

        expect(ana).toMatchObject({ calificacion: 4.3, resenas: 3 });
    });
});
