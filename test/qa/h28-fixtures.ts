import type { ReporteRenovacionResponseDto } from '../../src/reportes/dto/index.js';

export const AHORA_H28 = new Date('2026-11-06T16:00:00Z');
export const RANGO_H28 = { desde: '2026-10-07', hasta: '2026-11-06' };
// Oráculo transcrito y calculado a mano:4/(4+3)*100=57.142857... ->57.1;
// complemento100-57.1=42.9. No usa funciones H28 para construir esperados.
export const ESPERADO_H28 = {
    renovadas: 4, canceladas: 3, enPeriodo: 1, tasaRenovacion: 57.1, tasaCancelacion: 42.9,
    noRenovaron: [
        { nombre: 'Sofía Castillo', codigo: 'MBR-000045', plan: 'Set de clases mensual', fechaVencimiento: '2026-10-25' },
        { nombre: 'Diego Flores', codigo: 'MBR-000033', plan: 'Mensual', fechaVencimiento: '2026-10-20' },
        { nombre: 'Laura Hernández', codigo: 'MBR-000021', plan: 'Mensual', fechaVencimiento: '2026-10-15' },
    ],
} satisfies ReporteRenovacionResponseDto;
export const originalesH28 = () => [
    { id: 'M1', nombre: 'Carlos Molina', codigo: 'MBR-000011', plan: 'Mensual', fechaVencimiento: '2026-10-10', renovada: true },
    { id: 'M2', nombre: 'Andrea Rivas', codigo: 'MBR-000014', plan: 'Set de clases mensual', fechaVencimiento: '2026-10-12', renovada: true },
    { id: 'M8', nombre: 'Pedro Alvarado', codigo: 'MBR-000027', plan: 'Mensual', fechaVencimiento: '2026-10-18', renovada: true },
    { id: 'M9', nombre: 'Lucía Méndez', codigo: 'MBR-000030', plan: 'Set de clases mensual', fechaVencimiento: '2026-10-22', renovada: true },
    { id: 'M3', ...ESPERADO_H28.noRenovaron[2]!, renovada: false },
    { id: 'M4', ...ESPERADO_H28.noRenovaron[1]!, renovada: false },
    { id: 'M5', ...ESPERADO_H28.noRenovaron[0]!, renovada: false },
    { id: 'M6', nombre: 'Javier Ortiz', codigo: 'MBR-000052', plan: 'Mensual', fechaVencimiento: '2026-11-02', renovada: false },
];
