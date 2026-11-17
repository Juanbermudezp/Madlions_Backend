import { Logger } from '@nestjs/common';
import type { MockInstance } from 'vitest';
import type { RegistroAccesoRepository } from '@Accesos/repositories';
import { CierreAutomaticoService } from './cierre-automatico.service.js';

// 16/11/2026 a las 23:59 en El Salvador = 17/11/2026 05:59 UTC.
const LAS_2359 = new Date('2026-11-17T05:59:00Z');

describe('CierreAutomaticoService', () => {
    const repo = { cerrarAbiertosDelDia: vi.fn() };
    const service = new CierreAutomaticoService(repo as unknown as RegistroAccesoRepository);
    let log: MockInstance;

    beforeEach(() => {
        vi.resetAllMocks();
        // Solo se simula el reloj (Date); las promesas siguen funcionando normal.
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(LAS_2359);
        log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('está programada a las 23:59 en hora de El Salvador', () => {
        expect(
            Reflect.getMetadata('SCHEDULE_CRON_OPTIONS', CierreAutomaticoService.prototype.ejecutar),
        ).toMatchObject({ cronTime: '59 23 * * *', timeZone: 'America/El_Salvador' });
    });

    it('a las 23:59 cierra los ingresos abiertos de ese día con salida a las 23:59', async () => {
        repo.cerrarAbiertosDelDia.mockResolvedValue(3);

        await expect(service.ejecutar()).resolves.toBe(3);

        // Desde las 00:00 del 16/11 (06:00 UTC) hasta las 23:59 (05:59 UTC del 17/11).
        expect(repo.cerrarAbiertosDelDia).toHaveBeenCalledWith(
            new Date('2026-11-16T06:00:00Z'),
            LAS_2359,
        );
        expect(log).toHaveBeenCalledWith('Cierre automático del 2026-11-16: 3 ingreso(s) cerrado(s).');
    });

    it('correrla dos veces no cambia nada la segunda vez', async () => {
        repo.cerrarAbiertosDelDia.mockResolvedValueOnce(2).mockResolvedValueOnce(0);

        await expect(service.ejecutar()).resolves.toBe(2);
        await expect(service.ejecutar()).resolves.toBe(0);

        expect(repo.cerrarAbiertosDelDia).toHaveBeenNthCalledWith(2, new Date('2026-11-16T06:00:00Z'), LAS_2359);
        expect(log).toHaveBeenLastCalledWith('Cierre automático del 2026-11-16: 0 ingreso(s) cerrado(s).');
    });
});