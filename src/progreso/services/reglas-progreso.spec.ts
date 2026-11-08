import { BadRequestException } from '@nestjs/common';
import { TipoProgreso } from '@PrismaClient';
import {
  calcularEvolucion, validarFechaRegistro, validarFiltroFechas, validarMedicion,
} from './reglas-progreso.js';

const AHORA = new Date('2026-11-07T20:00:00Z'); // 14:00 El Salvador

describe('BE-16.1 reglas del progreso', () => {
  it('permite PESO desde 20.0 hasta 300.0', () => {
    expect(validarMedicion({ tipo: TipoProgreso.PESO, valor: 20.0 }).valor).toBe(20);
    expect(validarMedicion({ tipo: TipoProgreso.PESO, valor: 300.0 }).valor).toBe(300);
  });

  it.each([0, -1, 19.9, 300.1, 75.55])('rechaza peso %s', (valor) => {
    expect(() => validarMedicion({ tipo: TipoProgreso.PESO, valor })).toThrow(BadRequestException);
  });

  it('valida el rango de medidas y de marca', () => {
    expect(validarMedicion({ tipo: TipoProgreso.CINTURA, valor: 10 }).valor).toBe(10);
    expect(() => validarMedicion({ tipo: TipoProgreso.CINTURA, valor: 250.1 })).toThrow(BadRequestException);
    expect(validarMedicion({ tipo: TipoProgreso.MARCA, valor: 0.5, ejercicio: 'Press banca', repeticiones: 8 }).valor).toBe(0.5);
    expect(() => validarMedicion({ tipo: TipoProgreso.MARCA, valor: 500.1, ejercicio: 'Press banca', repeticiones: 8 })).toThrow(BadRequestException);
    expect(() => validarMedicion({ tipo: TipoProgreso.MARCA, valor: 60, ejercicio: '', repeticiones: 8 })).toThrow(BadRequestException);
    expect(() => validarMedicion({ tipo: TipoProgreso.MARCA, valor: 60, ejercicio: 'Press banca', repeticiones: 101 })).toThrow(BadRequestException);
    expect(() => validarMedicion({ tipo: TipoProgreso.PESO, valor: 70, ejercicio: 'Sentadilla' })).toThrow(BadRequestException);
  });

  it('rechaza fecha futura o calendario inválido', () => {
    expect(validarFechaRegistro('2026-11-07', AHORA).toISOString()).toBe('2026-11-07T00:00:00.000Z');
    expect(() => validarFechaRegistro('2026-11-08', AHORA)).toThrow(BadRequestException);
    expect(() => validarFechaRegistro('2026-02-30', AHORA)).toThrow(BadRequestException);
    expect(() => validarFiltroFechas('2026-10-20', '2026-10-19')).toThrow(BadRequestException);
  });

  it('no calcula diferencia con 0 o 1 registro', () => {
    expect(calcularEvolucion([])).toEqual({ primero: null, ultimo: null, diferencia: null, porcentaje: null });
    expect(calcularEvolucion([80])).toEqual({ primero: 80, ultimo: 80, diferencia: null, porcentaje: null });
  });

  it('calcula primer valor, último, diferencia y porcentaje a 1 decimal', () => {
    expect(calcularEvolucion([80, 78, 76.5])).toEqual({
      primero: 80, ultimo: 76.5, diferencia: -3.5, porcentaje: -4.4,
    });
  });
});
