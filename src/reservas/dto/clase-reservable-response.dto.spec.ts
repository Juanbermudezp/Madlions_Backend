import type { ClaseConRelaciones } from '@Clases/repositories';
import { EstadoClase } from '@PrismaClient';
import { ClaseReservableResponseDto } from './clase-reservable-response.dto.js';

describe('ClaseReservableResponseDto', () => {
    const ahora = new Date('2026-11-20T15:00:00Z');
    const clase = {
        id: 'c1',
        tipoClaseId: 't1',
        entrenadorId: 'e1',
        descripcion: null,
        inicio: new Date('2026-11-21T13:00:00Z'),
        fin: new Date('2026-11-21T14:00:00Z'),
        cupoMaximo: 20,
        estado: EstadoClase.PROGRAMADA,
        creadoEn: ahora,
        tipoClase: { id: 't1', nombre: 'Spinning', descripcion: 'x', activo: true, creadoEn: ahora },
        entrenador: { id: 'e1', nombre: 'Carlos', apellido: 'Martínez' },
    } as ClaseConRelaciones;

    it('trae el cupo máximo para que la pantalla calcule qué tan llena está (H7, rediseño de Clases de la semana)', () => {
        expect(ClaseReservableResponseDto.fromEntity(clase, 18, false)).toMatchObject({
            cupoMaximo: 20,
            lugaresDisponibles: 2,
        });
    });

    it('nunca devuelve lugares negativos', () => {
        expect(ClaseReservableResponseDto.fromEntity(clase, 25, true).lugaresDisponibles).toBe(0);
    });
});
