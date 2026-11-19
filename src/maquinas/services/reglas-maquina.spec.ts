import { Rol } from '@PrismaClient';
import { puedeVerDatosInternos } from './reglas-maquina.js';

describe('puedeVerDatosInternos', () => {
    it('el administrador y el entrenador ven los datos internos', () => {
        expect(puedeVerDatosInternos(Rol.ADMINISTRADOR)).toBe(true);
        expect(puedeVerDatosInternos(Rol.ENTRENADOR)).toBe(true);
    });

    it('el miembro y recepción no los ven', () => {
        expect(puedeVerDatosInternos(Rol.MIEMBRO)).toBe(false);
        expect(puedeVerDatosInternos(Rol.RECEPCION)).toBe(false);
    });
});
