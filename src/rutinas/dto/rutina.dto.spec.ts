import { ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateRutinaDto, RutinasQueryDto, UpdateRutinaDto } from './index.js';

const miembroId = '11111111-1111-4111-8111-111111111111';
const ejercicio = { nombre: 'Press banca', series: 4, repeticiones: 8, descansoSeg: 120 };
const dia = { nombre: 'Pecho', ejercicios: [ejercicio] };
const editable = { nombre: 'Fuerza', objetivo: 'Ganar fuerza', fechaInicio: '2026-11-18', dias: [dia] };
const valido = { ...editable, miembroId };
const opciones = { whitelist: true, forbidNonWhitelisted: true };

const errores = (datos: unknown) => validate(plainToInstance(CreateRutinaDto, datos), opciones);

describe('DTOs BE-14.1', () => {
  it('acepta extremos y recorta todos los textos incluidos los anidados', async () => {
    for (const [dias, ejercicios, series, repeticiones, descansoSeg] of [[1, 1, 1, 1, 0], [7, 15, 10, 50, 600]]) {
      const dto = plainToInstance(CreateRutinaDto, {
        ...valido, nombre: '  ' + 'x'.repeat(dias === 1 ? 3 : 60) + '  ',
        objetivo: '  ' + 'x'.repeat(dias === 1 ? 1 : 200) + '  ',
        dias: Array.from({ length: dias }, () => ({ nombre: '  ' + 'x'.repeat(dias === 1 ? 1 : 40) + '  ',
          ejercicios: Array.from({ length: ejercicios }, () => ({ ...ejercicio,
            nombre: '  ' + 'x'.repeat(dias === 1 ? 1 : 60) + '  ', series, repeticiones, descansoSeg })) })),
      });
      expect(await validate(dto, opciones)).toEqual([]);
      expect(dto.nombre).toBe(dto.nombre.trim());
      expect(dto.objetivo).toBe(dto.objetivo.trim());
      expect(dto.dias[0]?.nombre).toBe(dto.dias[0]?.nombre.trim());
      expect(dto.dias[0]?.ejercicios[0]?.nombre.startsWith(' ')).toBe(false);
    }
  });

  it.each([
    { nombre: 'ab' }, { nombre: 'x'.repeat(61) }, { nombre: '   ' },
    { objetivo: '' }, { objetivo: 'x'.repeat(201) }, { objetivo: '   ' },
    { miembroId: 'otro' }, { miembroId: null }, { miembroId: undefined },
    { fechaInicio: '18-11-2026' }, { fechaInicio: null },
    { dias: [] }, { dias: Array(8).fill(dia) }, { dias: null }, { dias: [[]] },
    { dias: [{ ...dia, nombre: '' }] }, { dias: [{ ...dia, nombre: 'x'.repeat(41) }] },
    { dias: [{ ...dia, ejercicios: [] }] }, { dias: [{ ...dia, ejercicios: Array(16).fill(ejercicio) }] },
    { dias: [{ ...dia, ejercicios: [null] }] }, { dias: [{ ...dia, ejercicios: [[]] }] },
  ])('rechaza estructura o campo invalido: %j', async (cambios) => {
    expect((await errores({ ...valido, ...cambios })).length).toBeGreaterThan(0);
  });

  it.each([
    { nombre: '' }, { nombre: '   ' }, { nombre: 'x'.repeat(61) },
    { series: 0 }, { series: 11 }, { series: 1.5 }, { series: '4' },
    { repeticiones: 0 }, { repeticiones: 51 }, { repeticiones: 2.5 },
    { descansoSeg: -1 }, { descansoSeg: 601 }, { descansoSeg: 0.5 },
  ])('rechaza ejercicio fuera de limites: %j', async (cambios) => {
    expect((await errores({ ...valido, dias: [{ ...dia, ejercicios: [{ ...ejercicio, ...cambios }] }] })).length).toBeGreaterThan(0);
  });

  it('todos los campos del PUT y los ejercicios son obligatorios, incluso ante null', async () => {
    for (const key of Object.keys(editable)) {
      for (const value of [undefined, null]) {
        expect((await validate(plainToInstance(UpdateRutinaDto, { ...editable, [key]: value }), opciones)).length).toBeGreaterThan(0);
      }
    }
    for (const key of Object.keys(ejercicio)) {
      expect((await errores({ ...valido, dias: [{ ...dia, ejercicios: [{ ...ejercicio, [key]: null }] }] })).length).toBeGreaterThan(0);
    }
  });

  it('rechaza campos de propietario, auditoria y orden enviados por el cliente', async () => {
    const pipe = new ValidationPipe({ ...opciones, transform: true });
    for (const campo of ['miembroId', 'entrenadorId', 'id', 'creadoEn', 'actualizadoEn']) {
      await expect(pipe.transform({ ...editable, [campo]: miembroId }, { type: 'body', metatype: UpdateRutinaDto })).rejects.toThrow();
    }
    expect((await errores({ ...valido, entrenadorId: miembroId })).length).toBeGreaterThan(0);
    expect((await errores({ ...valido, dias: [{ ...dia, orden: 7 }] })).length).toBeGreaterThan(0);
    expect((await errores({ ...valido, dias: [{ ...dia, ejercicios: [{ ...ejercicio, orden: 2 }] }] })).length).toBeGreaterThan(0);
  });

  it('acepta PUT completo y filtro opcional, rechaza filtro UUID invalido/null', async () => {
    expect(await validate(plainToInstance(UpdateRutinaDto, editable), opciones)).toEqual([]);
    expect(await validate(plainToInstance(RutinasQueryDto, {}), opciones)).toEqual([]);
    expect(await validate(plainToInstance(RutinasQueryDto, { miembroId }), opciones)).toEqual([]);
    for (const valor of ['', 'invalido', null, [miembroId]]) {
      expect((await validate(plainToInstance(RutinasQueryDto, { miembroId: valor }), opciones)).length).toBeGreaterThan(0);
    }
  });
});
