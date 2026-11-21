import { BadRequestException } from '@nestjs/common';
import type { ReportesRepository } from '@Reportes/repositories';
import { ReportesService } from './reportes.service.js';
import { AHORA_H28, originalesH28, ESPERADO_H28, RANGO_H28 } from '../../../test/qa/h28-fixtures.js';

describe('ReportesService.renovacion', () => {
    const repo = { renovacion: vi.fn() };
    const servicio = new ReportesService(repo as unknown as ReportesRepository);
    beforeEach(() => { vi.resetAllMocks(); repo.renovacion.mockResolvedValue(originalesH28()); });
    it('matriz oficial y mismo reloj hasta repositorio', async () => {
        expect(await servicio.renovacion(RANGO_H28.desde, RANGO_H28.hasta, AHORA_H28)).toEqual(ESPERADO_H28);
        expect(repo.renovacion).toHaveBeenCalledExactlyOnceWith('2026-10-07', '2026-11-06', AHORA_H28);
    });
    it('por defecto30d inclusive, conservando DATE sin desplazar', async () => {
        await servicio.renovacion(undefined, undefined, AHORA_H28);
        expect(repo.renovacion).toHaveBeenCalledWith('2026-10-08', '2026-11-06', AHORA_H28);
    });
    it('antes de06Z sigue siendo día7 local, a06Z empieza día8', async () => {
        repo.renovacion.mockResolvedValue([{ ...originalesH28()[0], renovada: false, fechaVencimiento: '2026-10-29' }]);
        expect((await servicio.renovacion(undefined, undefined, new Date('2026-11-06T05:59:59.999Z'))).enPeriodo).toBe(1);
        expect((await servicio.renovacion(undefined, undefined, new Date('2026-11-06T06:00:00Z'))).canceladas).toBe(1);
    });
    it.each([['2026-11-07', '2026-11-06'], ['2026-02-30', '2026-03-01'], ['2026-01-01', '2027-01-01']])('rechaza rango%s–%s antes de consultar', async (desde, hasta) => {
        await expect(servicio.renovacion(desde, hasta, AHORA_H28)).rejects.toThrow(BadRequestException);
        expect(repo.renovacion).not.toHaveBeenCalled();
    });
    it('acepta12meses y completa extremos opcionales con reglasH26', async () => {
        await servicio.renovacion('2026-01-01', '2026-12-31', AHORA_H28);
        expect(repo.renovacion).toHaveBeenLastCalledWith('2026-01-01', '2026-12-31', AHORA_H28);
        await servicio.renovacion('2026-10-01', undefined, AHORA_H28);
        expect(repo.renovacion).toHaveBeenLastCalledWith('2026-10-01', '2026-10-30', AHORA_H28);
        await servicio.renovacion(undefined, '2026-10-01', AHORA_H28);
        expect(repo.renovacion).toHaveBeenLastCalledWith('2026-09-02', '2026-10-01', AHORA_H28);
    });
    it('propaga error de BD sin convertirlo en reporte vacío', async () => {
        repo.renovacion.mockRejectedValue(new Error('offline'));
        await expect(servicio.renovacion(undefined, undefined, AHORA_H28)).rejects.toThrow('offline');
    });
});
