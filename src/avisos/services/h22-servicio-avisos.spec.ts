import { BadRequestException, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants.js';
import type { PrismaService } from '@Prisma/services';
import { EstadoAviso, ModuloOrigen, type Aviso } from '@PrismaClient';
import { AvisoRepository, type AvisoBandejaRepository } from '@Avisos/repositories';
import { MiembrosInexistentesError } from '@Avisos/errors';
import { AvisosController } from '../controllers/avisos.controller.js';
import { AvisosBandejaService } from './avisos-bandeja.service.js';
import { AvisosService } from './avisos.service.js';

const M1 = '11111111-1111-4111-8111-111111111111';
const M2 = '22222222-2222-4222-8222-222222222222';
const M3 = '33333333-3333-4333-8333-333333333333';
const base = { destinatarios: [M1], titulo: 'Reserva confirmada: Yoga', mensaje: 'Tu lugar quedó reservado.', moduloOrigen: ModuloOrigen.CLASES };

describe('H22. Servicio de avisos', () => {
    const repo = { crearParaMiembros: vi.fn() };
    const service = new AvisosService(repo as unknown as AvisoRepository);

    beforeEach(() => {
        vi.resetAllMocks();
        repo.crearParaMiembros.mockImplementation((d: { miembroIds: string[] }) => Promise.resolve(d.miembroIds.length));
    });

    it('AC1: registra un aviso "No leído" por cada destinatario (de 1 a 500)', async () => {
        await expect(service.enviar({ ...base, destinatarios: [M1, M2, M3] })).resolves.toEqual({ creados: 3, omitidosPorDuplicado: 0 });

        const tx = { miembro: { findMany: vi.fn().mockResolvedValue([{ id: M1 }, { id: M2 }]) }, aviso: { createMany: vi.fn().mockResolvedValue({ count: 2 }) } };
        const prisma = { $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)) };
        await new AvisoRepository(prisma as unknown as PrismaService).crearParaMiembros({ miembroIds: [M1, M2], titulo: 't', mensaje: 'm', moduloOrigen: ModuloOrigen.CLASES });
        expect(tx.aviso.createMany.mock.calls[0][0].data).toHaveLength(2);

        const quinientos = Array.from({ length: 501 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
        await expect(service.enviar({ ...base, destinatarios: quinientos })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('AC2: el módulo de origen solo acepta MEMBRESIAS, CLASES, SESIONES o PAGOS', async () => {
        expect(Object.values(ModuloOrigen).sort()).toEqual(['CLASES', 'MEMBRESIAS', 'PAGOS', 'SESIONES']);
        await expect(service.enviar({ ...base, moduloOrigen: 'RESERVAS' as ModuloOrigen })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('AC3: con una referencia repetida para el mismo destinatario no crea otro e informa los omitidos', async () => {
        repo.crearParaMiembros.mockResolvedValue(1);

        const res = await service.enviar({ ...base, destinatarios: [M1, M2], referencia: 'clase-42-cancelada' });

        expect(res).toEqual({ creados: 1, omitidosPorDuplicado: 1 });

        const tx = { miembro: { findMany: vi.fn().mockResolvedValue([{ id: M1 }]) }, aviso: { createMany: vi.fn().mockResolvedValue({ count: 0 }) } };
        const prisma = { $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)) };
        await new AvisoRepository(prisma as unknown as PrismaService).crearParaMiembros({ miembroIds: [M1], titulo: 't', mensaje: 'm', moduloOrigen: ModuloOrigen.CLASES, referencia: 'clase-42-cancelada' });
        expect(tx.aviso.createMany.mock.calls[0][0].skipDuplicates).toBe(true);
    });

    it('AC4: el aviso registrado aparece en la bandeja del destinatario', async () => {
        const aviso = { id: 'a1', miembroId: M1, titulo: base.titulo, mensaje: base.mensaje, moduloOrigen: ModuloOrigen.CLASES, referencia: null,
            estado: EstadoAviso.NO_LEIDO, creadoEn: new Date('2026-11-20T10:00:00Z'), leidoEn: null } as Aviso;
        const bandejaRepo = { findMiembroIdDeUsuario: vi.fn().mockResolvedValue(M1), listarDelMiembro: vi.fn().mockResolvedValue({ avisos: [aviso], total: 1 }) };

        const bandeja = await new AvisosBandejaService(bandejaRepo as unknown as AvisoBandejaRepository).listar('u1');

        expect(bandeja.items).toEqual([expect.objectContaining({ id: 'a1', titulo: base.titulo, estado: 'NO_LEIDO' })]);
    });

    it('AC5: sin destinatario, sin título, con mensaje vacío o largo, módulo inválido o miembro inexistente no registra ninguno', async () => {
        const casos = [
            { destinatarios: [] }, { titulo: '' }, { titulo: 'x'.repeat(101) }, { mensaje: '' }, { mensaje: 'x'.repeat(501) },
        ];
        for (const caso of casos) {
            await expect(service.enviar({ ...base, ...caso })).rejects.toBeInstanceOf(BadRequestException);
        }
        expect(repo.crearParaMiembros).not.toHaveBeenCalled();

        repo.crearParaMiembros.mockRejectedValue(new MiembrosInexistentesError([M3]));
        await expect(service.enviar({ ...base, destinatarios: [M3] })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('AC6: no existe ningún endpoint para crear avisos desde la API', () => {
        const posts = Object.getOwnPropertyNames(AvisosController.prototype).filter((nombre) => {
            const handler = (AvisosController.prototype as unknown as Record<string, object>)[nombre];
            return nombre !== 'constructor' && Reflect.getMetadata(METHOD_METADATA, handler) === RequestMethod.POST;
        });
        expect(posts).toEqual(['marcarTodosLeidos']);
    });
});
