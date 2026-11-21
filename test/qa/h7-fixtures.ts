import { EstadoClase, EstadoReserva, TipoPlan } from '@PrismaClient';
import type { CancelacionClaseConfirmada } from '../../src/clases/repositories/clase.repository.js';

export const idH7 = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const AHORA_H7 = new Date('2026-11-20T16:00:00Z');
export const MOTIVO_H7 = 'El entrenador está incapacitado';
export const claseH7 = () => ({
    id: idH7(10), inicio: new Date('2026-11-21T01:00:00Z'), fin: new Date('2026-11-21T02:00:00Z'),
    tipoClase: { nombre: 'Yoga' }, entrenador: { nombre: 'Carlos', apellido: 'Martínez' },
    estado: EstadoClase.PROGRAMADA as EstadoClase, motivoCancelacion: null as string | null,
    canceladaEn: null as Date | null, canceladaPorId: null as string | null,
});
export const reservasH7 = () => [1, 2, 3, 4].map((n) => ({
    id: idH7(100 + n), claseId: idH7(10), miembroId: idH7(20 + n), membresiaId: idH7(40 + n),
    tipoPlan: n === 2 ? TipoPlan.MENSUAL : TipoPlan.SET_CLASES,
    estado: (n === 4 ? EstadoReserva.CANCELADA_MIEMBRO : EstadoReserva.CONFIRMADA) as EstadoReserva,
    canceladaEn: n === 4 ? new Date('2026-11-19T16:00:00Z') : null,
}));
export const capturaH7 = (): CancelacionClaseConfirmada => ({ clase: claseH7(), reservas: reservasH7()
    .filter(r => r.estado === EstadoReserva.CONFIRMADA)
    .map(r => ({ reservaId: r.id, miembroId: r.miembroId, creditoDevuelto: r.tipoPlan === TipoPlan.SET_CLASES })),
});
