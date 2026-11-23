import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '@Prisma/services';
import { EstadoAviso, ModuloOrigen, Rol, type Aviso } from '@PrismaClient';
import { AvisoBandejaRepository } from '@Avisos/repositories';
import { rolesPermitidos } from '../../../test/helpers/roles.js';
import { AvisosController } from '../controllers/avisos.controller.js';
import { AvisosBandejaService, MENSAJES_BANDEJA } from './avisos-bandeja.service.js';

const AHORA = new Date('2026-11-21T18:00:00Z');
const aviso = (id: string, estado: EstadoAviso = EstadoAviso.NO_LEIDO, miembroId = 'm1'): Aviso => ({
    id, miembroId, titulo: `Aviso ${id}`, mensaje: `Mensaje completo de ${id}`, moduloOrigen: ModuloOrigen.MEMBRESIAS,
    referencia: null, estado, creadoEn: new Date('2026-11-20T10:00:00Z'), leidoEn: estado === EstadoAviso.LEIDO ? AHORA : null,
}) as Aviso;

describe('H23. Bandeja de avisos', () => {
    const repo = {
        findMiembroIdDeUsuario: vi.fn(), listarDelMiembro: vi.fn(), findPorId: vi.fn(),
        marcarLeido: vi.fn(), contarNoLeidos: vi.fn(), marcarTodosLeidos: vi.fn(),
    };
    const service = new AvisosBandejaService(repo as unknown as AvisoBandejaRepository);
    const prismaBandeja = () => {
        const prisma = { aviso: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) }, $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)) };
        return { prisma, repositorio: new AvisoBandejaRepository(prisma as unknown as PrismaService) };
    };

    beforeEach(() => {
        vi.resetAllMocks();
        repo.findMiembroIdDeUsuario.mockResolvedValue('m1');
        repo.listarDelMiembro.mockResolvedValue({ avisos: [aviso('a2'), aviso('a1', EstadoAviso.LEIDO)], total: 25 });
        repo.findPorId.mockResolvedValue(aviso('a1'));
        repo.marcarLeido.mockResolvedValue(aviso('a1', EstadoAviso.LEIDO));
    });

    it('AC1: lista título, módulo, fecha y estado, el más reciente primero, en páginas de 20', async () => {
        const res = await service.listar('u1', { pagina: 2 });
        expect(repo.listarDelMiembro).toHaveBeenCalledWith('m1', { soloNoLeidos: false, saltar: 20, tomar: 20 });
        expect(res.items[0]).toEqual({ id: 'a2', titulo: 'Aviso a2', moduloOrigen: 'MEMBRESIAS', creadoEn: '2026-11-20T10:00:00.000Z', estado: 'NO_LEIDO' });

        const { prisma, repositorio } = prismaBandeja();
        await repositorio.listarDelMiembro('m1', { soloNoLeidos: false, saltar: 0, tomar: 20 });
        expect(prisma.aviso.findMany.mock.calls[0][0].orderBy[0]).toEqual({ creadoEn: 'desc' });
    });

    it('AC2: al abrir un aviso veo el mensaje completo y pasa a "Leído"', async () => {
        const detalle = await service.abrir('u1', 'a1', AHORA);

        expect(repo.marcarLeido).toHaveBeenCalledWith('a1', AHORA);
        expect(detalle).toMatchObject({ mensaje: 'Mensaje completo de a1', estado: 'LEIDO' });
    });

    it('AC3: "Marcar todos como leídos" pasa todos los no leídos a "Leído"', async () => {
        repo.marcarTodosLeidos.mockResolvedValue(4);

        await expect(service.marcarTodosLeidos('u1', AHORA)).resolves.toEqual({ actualizados: 4 });
        expect(repo.marcarTodosLeidos).toHaveBeenCalledWith('m1', AHORA);
    });

    it('AC4: el contador del menú devuelve los avisos no leídos del miembro', async () => {
        repo.contarNoLeidos.mockResolvedValue(3);
        await expect(service.contarNoLeidos('u1')).resolves.toEqual({ noLeidos: 3 });
        expect(rolesPermitidos(AvisosController, 'contarNoLeidos')).toEqual([Rol.MIEMBRO]);
    });

    it('AC5: sin avisos la bandeja viene vacía', async () => {
        repo.listarDelMiembro.mockResolvedValue({ avisos: [], total: 0 });
        await expect(service.listar('u1')).resolves.toEqual({ items: [], total: 0, pagina: 1 });
    });

    it('AC6: el filtro "No leídos" solo trae los avisos sin leer', async () => {
        await service.listar('u1', { soloNoLeidos: true });
        expect(repo.listarDelMiembro).toHaveBeenCalledWith('m1', expect.objectContaining({ soloNoLeidos: true }));

        const { prisma, repositorio } = prismaBandeja();
        await repositorio.listarDelMiembro('m1', { soloNoLeidos: true, saltar: 0, tomar: 20 });
        expect(prisma.aviso.findMany.mock.calls[0][0].where).toEqual({ miembroId: 'm1', estado: 'NO_LEIDO' });
    });

    it('AC7: no puedo ver ni marcar el aviso de otro miembro', async () => {
        repo.findPorId.mockResolvedValue(aviso('a9', EstadoAviso.NO_LEIDO, 'm2'));

        await expect(service.abrir('u1', 'a9', AHORA)).rejects.toThrow(new ForbiddenException(MENSAJES_BANDEJA.ajeno));
        expect(repo.marcarLeido).not.toHaveBeenCalled();
    });
});
