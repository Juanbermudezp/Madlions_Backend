import type { AvisoVencimientoRepository } from '@Avisos/repositories';
import type { EstadoMembresiaDetalle, EstadoMembresiaService } from '@Membresias/services';
import { ModuloOrigen, TipoPlan } from '@PrismaClient';
import type { AvisosService } from './avisos.service.js';
import { AvisosVencimientoService, CRON_AVISOS_VENCIMIENTO, TITULO_VENCIMIENTO } from './avisos-vencimiento.service.js';

const A_LAS_6 = new Date('2026-11-20T12:00:00Z'); // 20/11 a las 06:00 en El Salvador
const estado = (membresiaId: string, datos: Partial<EstadoMembresiaDetalle> = {}): EstadoMembresiaDetalle => ({
    estado: 'PROXIMA_A_VENCER', membresiaId, plan: 'Mensual', tipoPlan: TipoPlan.MENSUAL, fechaInicio: '2026-10-23',
    fechaVencimiento: '2026-11-21', diasRestantes: 1, creditosTotales: null, creditosDisponibles: null, tiposClaseIds: [], renovacion: null, ...datos,
});

describe('H24. Aviso de próximo vencimiento de membresía', () => {
    const repo = { miembrosConVencimientoEntre: vi.fn() };
    const estados = { estadosDe: vi.fn() };
    const avisos = { enviar: vi.fn() };
    const service = new AvisosVencimientoService(repo as unknown as AvisoVencimientoRepository,
        estados as unknown as EstadoMembresiaService, avisos as unknown as AvisosService);
    const conEstados = (pares: [string, EstadoMembresiaDetalle][]) => {
        repo.miembrosConVencimientoEntre.mockResolvedValue(pares.map(([id]) => id));
        estados.estadosDe.mockResolvedValue(new Map(pares));
    };

    beforeEach(() => {
        vi.resetAllMocks();
        avisos.enviar.mockResolvedValue({ creados: 1, omitidosPorDuplicado: 0 });
    });

    it('AC1: la tarea diaria de las 06:00 avisa a Mensual y Set a los que faltan 3 días o menos', async () => {
        expect(CRON_AVISOS_VENCIMIENTO).toBe('0 6 * * *');
        conEstados([['m1', estado('mem1')], ['m2', estado('mem2', { estado: 'VIGENTE', diasRestantes: 4 })]]);

        const res = await service.avisarVencimientos(A_LAS_6);

        expect(repo.miembrosConVencimientoEntre).toHaveBeenCalledWith('2026-11-20', '2026-11-23');
        expect(avisos.enviar).toHaveBeenCalledOnce();
        expect(avisos.enviar).toHaveBeenCalledWith(expect.objectContaining({ destinatarios: ['m1'], moduloOrigen: ModuloOrigen.MEMBRESIAS }));
        expect(res).toMatchObject({ dia: '2026-11-20', avisadas: 1, creados: 1 });
    });

    it('AC2: el título es "Tu membresía vence pronto" y el mensaje agrega las clases que quedan en un Set', async () => {
        conEstados([['m1', estado('mem1')], ['m2', estado('mem2', { plan: 'Set 8 clases', tipoPlan: TipoPlan.SET_CLASES, creditosTotales: 8, creditosDisponibles: 3 })]]);

        await service.avisarVencimientos(A_LAS_6);

        expect(avisos.enviar.mock.calls[0][0]).toMatchObject({ titulo: TITULO_VENCIMIENTO,
            mensaje: 'Tu plan Mensual vence el 21/11/2026. Desde esa fecha puedes pagar tu renovación; acércate a recepción para registrarla.' });
        expect(avisos.enviar.mock.calls[1][0].mensaje).toMatch(/Te quedan 3 clases por usar\.$/);
    });

    it('AC3: un Daypass no recibe aviso', async () => {
        conEstados([['m1', estado('mem1', { tipoPlan: TipoPlan.DAYPASS })]]);
        await service.avisarVencimientos(A_LAS_6);
        expect(avisos.enviar).not.toHaveBeenCalled();
    });

    it('AC4: con la renovación ya pagada ("Por iniciar") no se envía aviso', async () => {
        conEstados([['m1', estado('mem1', { renovacion: { estado: 'POR_INICIAR', fechaInicio: '2026-11-22' } as EstadoMembresiaDetalle['renovacion'] })]]);
        await service.avisarVencimientos(A_LAS_6);
        expect(avisos.enviar).not.toHaveBeenCalled();
    });

    it('AC5: si la tarea corre dos veces el mismo día usa la misma referencia y no duplica el aviso', async () => {
        conEstados([['m1', estado('mem1')]]);
        await service.avisarVencimientos(A_LAS_6);
        avisos.enviar.mockResolvedValue({ creados: 0, omitidosPorDuplicado: 1 });

        const segunda = await service.avisarVencimientos(A_LAS_6);

        expect(avisos.enviar.mock.calls.map(([a]) => a.referencia)).toEqual(['membresia-mem1-vence', 'membresia-mem1-vence']);
        expect(segunda).toMatchObject({ creados: 0, omitidosPorDuplicado: 1 });
    });

    it('AC6: si un día no corrió, al día siguiente avisa a las que siguen dentro de los 3 días', async () => {
        conEstados([['m1', estado('mem1', { fechaVencimiento: '2026-11-22', diasRestantes: 1 })], ['m2', estado('mem2', { fechaVencimiento: '2026-11-24', diasRestantes: 3 })]]);

        await service.avisarVencimientos(new Date('2026-11-21T12:00:00Z'));

        expect(repo.miembrosConVencimientoEntre).toHaveBeenCalledWith('2026-11-21', '2026-11-24');
        expect(avisos.enviar).toHaveBeenCalledTimes(2);
    });
});
