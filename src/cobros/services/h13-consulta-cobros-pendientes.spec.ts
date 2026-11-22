import type { CobroAdmin } from '@Cobros/repositories';
import { CobroAdminRepository } from '@Cobros/repositories';
import { CobrosAdminController } from '@Cobros/controllers';
import type { PrismaService } from '@Prisma/services';
import { ConceptoCobro, EstadoCobro, Prisma, ReferenciaCobro, Rol } from '@PrismaClient';
import { puedeEntrar } from '../../../test/helpers/roles.js';
import { COBROS_POR_PAGINA, CobrosAdminService } from './cobros-admin.service.js';

const HOY = '2026-11-18';
const cobro = (extra: Partial<CobroAdmin> = {}): CobroAdmin => ({
    id: 'c1',
    miembroId: 'm1',
    concepto: ConceptoCobro.MEMBRESIA,
    detalle: 'Mensual ilimitado',
    monto: new Prisma.Decimal('35.50'),
    referenciaTipo: ReferenciaCobro.MEMBRESIA,
    referenciaId: 'mem1',
    habilitadoDesde: null,
    estado: EstadoCobro.PENDIENTE,
    pagadoEn: null,
    creadoEn: new Date('2026-11-10T15:00:00Z'),
    miembro: { codigoMiembro: 'MBR-000002', usuario: { nombre: 'María', apellido: 'López' } },
    intentos: [],
    ...extra,
});

describe('H13. Consulta administrativa de cobros pendientes', () => {
    const repo = { idsDeMiembros: vi.fn(), listar: vi.fn() };
    const service = new CobrosAdminService(repo as unknown as CobroAdminRepository);

    beforeEach(() => {
        vi.resetAllMocks();
        repo.listar.mockResolvedValue({ cobros: [cobro()], total: 1, sumaMontos: new Prisma.Decimal('35.50') });
    });

    it('AC1: lista los pendientes con miembro, concepto, monto y fecha, del más antiguo al más reciente, de 20 en 20', async () => {
        const res = await service.listar({ pagina: 2 }, HOY);

        expect(repo.listar).toHaveBeenCalledWith({ estado: EstadoCobro.PENDIENTE, concepto: undefined, miembroIds: undefined }, 20, COBROS_POR_PAGINA);
        expect(COBROS_POR_PAGINA).toBe(20);
        expect(res.items[0]).toMatchObject({ miembro: { nombre: 'María López', codigo: 'MBR-000002' }, concepto: 'MEMBRESIA', monto: 35.5, creadoEn: '2026-11-10T15:00:00.000Z' });

        const prisma = { $transaction: vi.fn().mockResolvedValue([[], 0, { _sum: { monto: null } }]), cobro: { findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn() } };
        await new CobroAdminRepository(prisma as unknown as PrismaService).listar({ estado: EstadoCobro.PENDIENTE }, 0, 20);
        expect(prisma.cobro.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: [{ creadoEn: 'asc' }, { id: 'asc' }], take: 20 }));
    });

    it('AC2: busca por nombre o código y filtra por concepto, con la cantidad y la suma del filtro', async () => {
        repo.idsDeMiembros.mockResolvedValue(['m1']);
        repo.listar.mockResolvedValue({ cobros: [cobro()], total: 3, sumaMontos: new Prisma.Decimal('106.50') });

        const res = await service.listar({ q: 'MBR-000002', concepto: ConceptoCobro.RENOVACION }, HOY);

        expect(repo.listar).toHaveBeenCalledWith({ estado: EstadoCobro.PENDIENTE, concepto: ConceptoCobro.RENOVACION, miembroIds: ['m1'] }, 0, 20);
        expect(res).toMatchObject({ total: 3, sumaMontos: 106.5 });

        repo.idsDeMiembros.mockResolvedValue([]);
        await expect(service.listar({ q: 'nadie' }, HOY)).resolves.toEqual({ items: [], total: 0, sumaMontos: 0, pagina: 1 });
    });

    it('AC3: una renovación que aún no vence se marca como no habilitada', async () => {
        repo.listar.mockResolvedValue({
            cobros: [cobro({ concepto: ConceptoCobro.RENOVACION, habilitadoDesde: new Date('2026-11-30T00:00:00Z') })],
            total: 1,
            sumaMontos: new Prisma.Decimal('35.50'),
        });

        const [item] = (await service.listar({}, HOY)).items;
        expect(item).toMatchObject({ habilitado: false, habilitadoDesde: '2026-11-30' });
    });

    it('AC4: en la pestaña "Pagados" el cobro aprobado aparece con su número de transacción', async () => {
        repo.listar.mockResolvedValue({
            cobros: [cobro({ estado: EstadoCobro.PAGADO, pagadoEn: new Date('2026-11-17T20:00:00Z'), intentos: [{ referencia: 'PAY-20261117-ABC123' }] } as Partial<CobroAdmin>)],
            total: 1,
            sumaMontos: new Prisma.Decimal('35.50'),
        });

        const [item] = (await service.listar({ estado: EstadoCobro.PAGADO }, HOY)).items;
        expect(repo.listar).toHaveBeenCalledWith(expect.objectContaining({ estado: EstadoCobro.PAGADO }), 0, 20);
        expect(item).toMatchObject({ referencia: 'PAY-20261117-ABC123', pagadoEn: '2026-11-17T20:00:00.000Z' });
    });

    it('AC5: un cobro con intentos rechazados sigue entre los pendientes y sin referencia', async () => {
        const prisma = { $transaction: vi.fn().mockResolvedValue([[], 0, { _sum: { monto: null } }]), cobro: { findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn() } };
        await new CobroAdminRepository(prisma as unknown as PrismaService).listar({ estado: EstadoCobro.PENDIENTE }, 0, 20);

        // Solo cuenta el estado del cobro; las referencias se toman únicamente de intentos APROBADOS.
        const args = prisma.cobro.findMany.mock.calls[0][0];
        expect(args.where).toEqual({ estado: EstadoCobro.PENDIENTE });
        expect(args.include.intentos.where).toEqual({ resultado: 'APROBADO' });

        const [item] = (await service.listar({}, HOY)).items;
        expect(item).not.toHaveProperty('referencia');
    });

    it('AC6: miembro, entrenador y recepción reciben "Acceso denegado"', () => {
        for (const rol of [Rol.MIEMBRO, Rol.ENTRENADOR, Rol.RECEPCION]) {
            expect(puedeEntrar(CobrosAdminController, 'listar', rol)).toBe(false);
        }
        expect(puedeEntrar(CobrosAdminController, 'listar', Rol.ADMINISTRADOR)).toBe(true);
        expect(Reflect.getMetadata('mensajeSinPermiso', CobrosAdminController)).toBe('Acceso denegado');
    });
});
