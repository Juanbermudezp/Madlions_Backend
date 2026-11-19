import type { CobroAdmin, CobroAdminRepository } from '@Cobros/repositories';
import { ConceptoCobro, EstadoCobro, Prisma, ReferenciaCobro } from '@PrismaClient';
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

describe('CobrosAdminService.listar', () => {
    const repo = { idsDeMiembros: vi.fn(), listar: vi.fn() };
    const service = new CobrosAdminService(repo as unknown as CobroAdminRepository);

    beforeEach(() => {
        vi.resetAllMocks();
        repo.listar.mockResolvedValue({ cobros: [cobro()], total: 1, sumaMontos: new Prisma.Decimal('35.50') });
    });

    it('sin filtros: pendientes, página 1, 20 por página', async () => {
        const res = await service.listar({}, HOY);

        expect(repo.listar).toHaveBeenCalledWith(
            { estado: EstadoCobro.PENDIENTE, concepto: undefined, miembroIds: undefined },
            0,
            COBROS_POR_PAGINA,
        );
        expect(repo.idsDeMiembros).not.toHaveBeenCalled();
        expect(res).toEqual({
            items: [{
                id: 'c1',
                miembro: { nombre: 'María López', codigo: 'MBR-000002' },
                concepto: ConceptoCobro.MEMBRESIA,
                detalle: 'Mensual ilimitado',
                monto: 35.5,
                creadoEn: '2026-11-10T15:00:00.000Z',
                habilitado: true,
                habilitadoDesde: null,
                pagadoEn: null,
            }],
            total: 1,
            sumaMontos: 35.5,
            pagina: 1,
        });
    });

    it('la página 3 salta los primeros 40', async () => {
        await service.listar({ estado: EstadoCobro.PAGADO, concepto: ConceptoCobro.RENOVACION, pagina: 3 }, HOY);
        expect(repo.listar).toHaveBeenCalledWith(
            { estado: EstadoCobro.PAGADO, concepto: ConceptoCobro.RENOVACION, miembroIds: undefined },
            40,
            COBROS_POR_PAGINA,
        );
    });

    it('la búsqueda se normaliza (minúsculas, sin tildes, comodines escapados)', async () => {
        repo.idsDeMiembros.mockResolvedValue(['m1']);
        await service.listar({ q: '  Núñez_50% ' }, HOY);

        expect(repo.idsDeMiembros).toHaveBeenCalledWith('nunez\\_50\\%');
        expect(repo.listar.mock.calls[0][0]).toMatchObject({ miembroIds: ['m1'] });
    });

    it('si ningún miembro coincide, devuelve vacío sin consultar los cobros', async () => {
        repo.idsDeMiembros.mockResolvedValue([]);
        await expect(service.listar({ q: 'nadie', pagina: 2 }, HOY)).resolves.toEqual({
            items: [], total: 0, sumaMontos: 0, pagina: 2,
        });
        expect(repo.listar).not.toHaveBeenCalled();
    });

    it('una búsqueda de solo espacios no filtra', async () => {
        await service.listar({ q: '   ' }, HOY);
        expect(repo.idsDeMiembros).not.toHaveBeenCalled();
    });

    it('renovación anticipada: no habilitada y con su fecha de habilitación', async () => {
        repo.listar.mockResolvedValue({
            cobros: [cobro({ concepto: ConceptoCobro.RENOVACION, habilitadoDesde: new Date('2026-11-25T00:00:00Z') })],
            total: 1,
            sumaMontos: new Prisma.Decimal('35.50'),
        });
        const { items } = await service.listar({}, HOY);
        expect(items[0]).toMatchObject({ habilitado: false, habilitadoDesde: '2026-11-25' });
    });

    it('renovación que se habilita hoy: ya está habilitada', async () => {
        repo.listar.mockResolvedValue({
            cobros: [cobro({ concepto: ConceptoCobro.RENOVACION, habilitadoDesde: new Date(`${HOY}T00:00:00Z`) })],
            total: 1,
            sumaMontos: new Prisma.Decimal('35.50'),
        });
        const { items } = await service.listar({}, HOY);
        expect(items[0].habilitado).toBe(true);
    });

    it('pagado: trae la fecha de pago y la referencia del pago aprobado', async () => {
        repo.listar.mockResolvedValue({
            cobros: [cobro({
                estado: EstadoCobro.PAGADO,
                pagadoEn: new Date('2026-11-16T15:00:00Z'),
                intentos: [{ referencia: 'PAY-20261116-A1B2C3' }],
            })],
            total: 1,
            sumaMontos: new Prisma.Decimal('35.50'),
        });
        const { items } = await service.listar({ estado: EstadoCobro.PAGADO }, HOY);
        expect(items[0]).toMatchObject({
            habilitado: false,
            pagadoEn: '2026-11-16T15:00:00.000Z',
            referencia: 'PAY-20261116-A1B2C3',
        });
    });

    it('sin cobros, la suma es 0', async () => {
        repo.listar.mockResolvedValue({ cobros: [], total: 0, sumaMontos: null });
        await expect(service.listar({}, HOY)).resolves.toMatchObject({ items: [], total: 0, sumaMontos: 0 });
    });
});