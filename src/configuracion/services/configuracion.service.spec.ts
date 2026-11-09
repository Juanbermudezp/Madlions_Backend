import { InternalServerErrorException } from '@nestjs/common';
import type { ConfiguracionRepository } from '@Configuracion/repositories';
import type { Configuracion } from '@PrismaClient';
import {
    CLAVE_PRECIO_CLASE_PUNTUAL,
    ConfiguracionService,
    PRECIO_CLASE_PUNTUAL_NO_CONFIGURADO,
} from './configuracion.service.js';

function fila(valor: string): Configuracion {
    return {
        clave: CLAVE_PRECIO_CLASE_PUNTUAL,
        valor,
        actualizadoEn: new Date('2026-11-08T12:00:00Z'),
    };
}

describe('ConfiguracionService', () => {
    const repo = { findByClave: vi.fn(), guardar: vi.fn() };
    const service = new ConfiguracionService(repo as unknown as ConfiguracionRepository);

    beforeEach(() => {
        vi.resetAllMocks();
    });

    describe('obtenerPrecioClasePuntual', () => {
        it('devuelve el precio guardado como texto', async () => {
            repo.findByClave.mockResolvedValue(fila('10.00'));

            await expect(service.obtenerPrecioClasePuntual()).resolves.toBe('10.00');
            expect(repo.findByClave).toHaveBeenCalledWith('precio_clase_puntual');
        });

        it('falla con 500 si no existe la fila de configuración', async () => {
            repo.findByClave.mockResolvedValue(null);

            await expect(service.obtenerPrecioClasePuntual()).rejects.toThrow(
                new InternalServerErrorException(PRECIO_CLASE_PUNTUAL_NO_CONFIGURADO),
            );
        });
    });

    describe('consultarPrecioClasePuntual', () => {
        it('responde { precio } con el valor guardado', async () => {
            repo.findByClave.mockResolvedValue(fila('10.00'));

            await expect(service.consultarPrecioClasePuntual()).resolves.toEqual({ precio: '10.00' });
        });
    });

    describe('actualizarPrecioClasePuntual', () => {
        it.each([
            [12.5, '12.50'],
            [12, '12.00'],
            [12.55, '12.55'],
            [0.01, '0.01'],
        ])('guarda %s como "%s" y lo devuelve', async (precio, guardado) => {
            repo.guardar.mockImplementation((_clave: string, valor: string) => Promise.resolve(fila(valor)));

            const respuesta = await service.actualizarPrecioClasePuntual({ precio });

            expect(repo.guardar).toHaveBeenCalledWith('precio_clase_puntual', guardado);
            expect(respuesta).toEqual({ precio: guardado });
        });
    });
});
