import type { PrismaService } from '@Prisma/services';
import { ModuloOrigen } from '@PrismaClient';
import type { AvisoClaseRepository } from '@Avisos/repositories';
import { ClaseRepository } from '../../clases/repositories/clase.repository.js';
import { CancelacionClaseService } from '../../clases/services/cancelacion-clase.service.js';
import { AHORA_H7, capturaH7, claseH7, idH7, MOTIVO_H7 } from '../../../test/qa/h7-fixtures.js';
import type { AvisosService } from './avisos.service.js';
import { AvisosClaseService } from './avisos-clase.service.js';

const clase = { id: idH7(10), tipo: 'Yoga', entrenador: 'Carlos Martínez', inicio: new Date('2026-11-21T01:00:00Z'), fin: new Date('2026-11-21T02:00:00Z') };
const SET = idH7(21);
const MENSUAL = idH7(22);

describe('H25. Aviso de cancelación de clase reservada', () => {
    const repo = { findClase: vi.fn() };
    const avisos = { enviar: vi.fn() };
    const service = new AvisosClaseService(repo as unknown as AvisoClaseRepository, avisos as unknown as AvisosService);
    const avisar = () => service.avisarCancelacion(clase.id, [{ miembroId: SET, devolvioCredito: true }, { miembroId: MENSUAL, devolvioCredito: false }], MOTIVO_H7);

    beforeEach(() => {
        vi.resetAllMocks();
        repo.findClase.mockResolvedValue(clase);
        avisos.enviar.mockImplementation((a: { destinatarios: string[] }) => Promise.resolve({ creados: a.destinatarios.length, omitidosPorDuplicado: 0 }));
    });

    it('AC1: al cancelar la clase cada miembro con reserva "Confirmada" recibe un aviso por el servicio de avisos', async () => {
        const res = await avisar();

        const destinatarios = avisos.enviar.mock.calls.flatMap(([a]) => a.destinatarios);
        expect(new Set(destinatarios)).toEqual(new Set([SET, MENSUAL]));
        expect(destinatarios).toHaveLength(2);
        expect(avisos.enviar.mock.calls.every(([a]) => a.moduloOrigen === ModuloOrigen.CLASES)).toBe(true);
        expect(res).toEqual({ creados: 2, omitidosPorDuplicado: 0, fallidos: 0 });
    });

    it('AC2: el título es "Clase cancelada: {tipo}" y el mensaje incluye fecha, horario, entrenador y motivo; con Set agrega el crédito devuelto', async () => {
        await avisar();

        const sinCredito = avisos.enviar.mock.calls.find(([a]) => a.destinatarios.includes(MENSUAL))![0];
        const conCredito = avisos.enviar.mock.calls.find(([a]) => a.destinatarios.includes(SET))![0];
        expect(sinCredito.titulo).toBe('Clase cancelada: Yoga');
        expect(sinCredito.mensaje).toBe('La clase de Yoga del 20/11/2026 de 19:00 a 20:00 con Carlos Martínez fue cancelada por el gimnasio. '
            + 'Motivo: El entrenador está incapacitado. Tu reserva quedó cancelada.');
        expect(conCredito.mensaje).toMatch(/Tu reserva quedó cancelada\. Tu crédito fue devuelto\.$/);
    });

    it('AC3: el aviso queda registrado "No leído" para la bandeja y su contador', async () => {
        await avisar();
        // AvisosService.enviar registra un aviso NO_LEIDO por destinatario (ver H22 AC1 y H23 AC4).
        expect(avisos.enviar).toHaveBeenCalledTimes(2);
    });

    it('AC4: quien no tenía reserva o la canceló él mismo no recibe el aviso', async () => {
        const tx = { clase: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), findUnique: vi.fn(), findUniqueOrThrow: vi.fn().mockResolvedValue(claseH7()) },
            $queryRaw: vi.fn().mockResolvedValue(capturaH7().reservas) };
        const prisma = { $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)) };
        const avisosClase = { avisarCancelacion: vi.fn().mockResolvedValue({ creados: 3, omitidosPorDuplicado: 0, fallidos: 0 }) };
        const cancelacion = new CancelacionClaseService(new ClaseRepository(prisma as unknown as PrismaService), avisosClase as unknown as AvisosClaseService);

        await cancelacion.cancelar(idH7(10), MOTIVO_H7, idH7(1), AHORA_H7);

        expect((tx.$queryRaw.mock.calls[0]![0] as string[]).join('?')).toContain("r.estado = 'CONFIRMADA'");
        const afectados = avisosClase.avisarCancelacion.mock.calls[0]![1] as { miembroId: string }[];
        expect(afectados.map((a) => a.miembroId)).not.toContain(idH7(24)); // reserva cancelada por el miembro
    });

    it('AC5: si el envío se repite usa la referencia clase-{id}-cancelada y no crea duplicados', async () => {
        await avisar();
        avisos.enviar.mockResolvedValue({ creados: 0, omitidosPorDuplicado: 1 });

        const repetido = await avisar();

        expect(new Set(avisos.enviar.mock.calls.map(([a]) => a.referencia))).toEqual(new Set([`clase-${clase.id}-cancelada`]));
        expect(repetido).toEqual({ creados: 0, omitidosPorDuplicado: 2, fallidos: 0 });
    });
});
