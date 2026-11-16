import { escaparLike, normalizarBusqueda } from './normalizar-busqueda.js';

describe('normalizarBusqueda', () => {
    it('pasa a minúsculas y quita tildes, diéresis y acentos', () => {
        expect(normalizarBusqueda('María JOSÉ Güémez')).toBe('maria jose guemez');
        expect(normalizarBusqueda('ÁÉÍÓÚ àèìòù âêîôû')).toBe('aeiou aeiou aeiou');
    });

    it('iguala la ñ a la n', () => {
        expect(normalizarBusqueda('NÚÑEZ')).toBe('nunez');
    });

    it('quita espacios de los extremos y junta los repetidos', () => {
        expect(normalizarBusqueda('  maria    lopez ')).toBe('maria lopez');
    });
});

describe('escaparLike', () => {
    it('escapa los comodines de LIKE', () => {
        expect(escaparLike('50%_a\\b')).toBe('50\\%\\_a\\\\b');
    });
});
