import { resumirRenovacion } from './reglas-renovacion.js';
import { originalesH28, ESPERADO_H28 } from '../../../test/qa/h28-fixtures.js';

const fila = (fechaVencimiento: string, renovada = false, id = 'm1') => ({ id, nombre: 'Ana Ruiz', codigo: 'MBR-000001', plan: 'Histórico', fechaVencimiento, renovada });
describe('H28 clasificación y tasas (funciones puras)', () => {
    it('matriz oficial:4/3/1,57.1/42.9,solo Sofía/Diego/Laura en orden', () => {
        expect(resumirRenovacion(originalesH28(), '2026-11-06')).toEqual(ESPERADO_H28);
    });
    it('renovación válida tiene prioridad incluso durante la gracia', () => {
        expect(resumirRenovacion([fila('2026-11-06', true)], '2026-11-06')).toMatchObject({ renovadas: 1, enPeriodo: 0, tasaRenovacion: 100, tasaCancelacion: 0, noRenovaron: [] });
    });
    it.each(['2026-10-30', '2026-11-02', '2026-11-06', '2026-11-20'])('vencimiento%s: día7/día4/día0/futuro sin pago no cancela', (vence) => {
        expect(resumirRenovacion([fila(vence)], '2026-11-06')).toEqual({ renovadas: 0, canceladas: 0, enPeriodo: 1, tasaRenovacion: null, tasaCancelacion: null, noRenovaron: [] });
    });
    it('día8 y cambios de año/bisiesto usan días calendario', () => {
        expect(resumirRenovacion([fila('2026-12-31')], '2027-01-08').canceladas).toBe(1);
        expect(resumirRenovacion([fila('2024-02-23')], '2024-03-01').enPeriodo).toBe(1);
        expect(resumirRenovacion([fila('2024-02-23')], '2024-03-02').canceladas).toBe(1);
    });
    it('vacío no inventa tasas', () => {
        expect(resumirRenovacion([], '2026-11-06')).toEqual({ renovadas: 0, canceladas: 0, enPeriodo: 0, tasaRenovacion: null, tasaCancelacion: null, noRenovaron: [] });
    });
    it.each([[1, 15, 6.3, 93.7], [1, 2, 33.3, 66.7], [2, 1, 66.7, 33.3], [0, 1, 0, 100], [1, 0, 100, 0]])('HALF_UP y complemento:%s renovadas/%s canceladas', (r, c, tr, tc) => {
        const filas = Array.from({ length: r + c }, (_, i) => fila('2026-10-01', i < r, String(i)));
        const res = resumirRenovacion(filas, '2026-11-06');
        expect(res).toMatchObject({ tasaRenovacion: tr, tasaCancelacion: tc });
        expect(res.tasaRenovacion! + res.tasaCancelacion!).toBe(100);
    });
    it('no muta entradas, mantiene varias membresías del mismo miembro y desempata porID', () => {
        const filas = [fila('2026-10-20', false, 'b'), fila('2026-10-25', false, 'c'), fila('2026-10-20', false, 'a')];
        const copia = structuredClone(filas);
        const res = resumirRenovacion(filas, '2026-11-06');
        expect(res.canceladas).toBe(3); expect(res.noRenovaron).toHaveLength(3);
        expect(res.noRenovaron.map((f) => f.fechaVencimiento)).toEqual(['2026-10-25', '2026-10-20', '2026-10-20']);
        expect(res.noRenovaron[0]).not.toHaveProperty('id'); expect(filas).toEqual(copia);
    });
});
