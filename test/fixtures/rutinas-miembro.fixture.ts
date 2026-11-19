import type { DetalleRutinaPropia, ResumenRutinaPropia } from '../../src/rutinas/repositories/rutina-miembro.repository.js';

export const USUARIO_A = '11111111-1111-4111-8111-111111111111';
export const USUARIO_B = '22222222-2222-4222-8222-222222222222';
export const MIEMBRO_A = '33333333-3333-4333-8333-333333333333';
export const MIEMBRO_B = '44444444-4444-4444-8444-444444444444';
export const ENTRENADOR = '55555555-5555-4555-8555-555555555555';
export const RUTINA_A = '66666666-6666-4666-8666-666666666666';
export const RUTINA_B = '77777777-7777-4777-8777-777777777777';
export const resumenReciente = {
  id: RUTINA_A, nombre: 'Fuerza general', objetivo: 'Mejorar fuerza', fechaInicio: new Date('2026-11-18T00:00:00Z'),
  entrenador: { id: ENTRENADOR, nombre: 'Carlos', apellido: 'Martínez' },
} satisfies ResumenRutinaPropia;
export const resumenAnterior = { ...resumenReciente, id: RUTINA_B, nombre: 'Fuerza inicial', fechaInicio: new Date('2026-11-16T00:00:00Z') };
export const detalle = {
  ...resumenReciente,
  dias: [
    { id: 'dia-a', orden: 1, nombre: 'Pecho', ejercicios: [
      { id: 'ej-a', orden: 1, nombre: 'Press banca', series: 4, repeticiones: 8, descansoSeg: 120 },
      { id: 'ej-b', orden: 2, nombre: 'Press militar', series: 3, repeticiones: 10, descansoSeg: 60 },
    ] },
    { id: 'dia-b', orden: 2, nombre: 'Piernas', ejercicios: [
      { id: 'ej-c', orden: 1, nombre: 'Sentadilla', series: 4, repeticiones: 8, descansoSeg: 180 },
    ] },
  ],
} satisfies DetalleRutinaPropia;
