import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { JwtAuthGuard, RolesGuard } from '@Auth/guards';
import type { UsersService } from '@Users/services';
import { PrismaModule } from '@Prisma';
import { PrismaService } from '@Prisma/services';
import { ConceptoCobro, EstadoCobro, Prisma, Rol, TipoPlan } from '@PrismaClient';
import { hoyLocal } from '@Common/fechas';
import { ReportesModule } from '../../src/reportes/index.js';
import type { FilaIngreso } from '../../src/reportes/repositories/index.js';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function pago(n: number, concepto: ConceptoCobro, monto: string, pagadoEn: string, tipoPlan: TipoPlan | null = null) {
    return { id: id(n), concepto, monto: new Prisma.Decimal(monto), estado: EstadoCobro.PAGADO,
        pagadoEn: new Date(pagadoEn), creadoEn: new Date('2026-01-01T12:00:00Z'),
        tipoPlanHistorico: tipoPlan, tipoPlanActual: TipoPlan.DAYPASS,
        miembro: { codigoMiembro: 'MBR-000001', usuario: { nombre: 'Ana', apellido: 'Martínez', email: 'no-publico@example.invalid' } },
        comprobante: { intento: { cobroId: id(n), resultado: 'APROBADO', referencia: `PAY-20261118-${String(n).padStart(6, '0')}` } },
        intentos: [{ resultado: 'RECHAZADO', referencia: 'rechazado-no-publico' }, { resultado: 'APROBADO', referencia: 'aprobado' }, { resultado: 'ERROR', referencia: 'error-no-publico' }],
    };
}
type CobroPrueba = Omit<ReturnType<typeof pago>, 'pagadoEn'> & { pagadoEn: Date | null };
type Filtro = { estado: EstadoCobro; concepto: ConceptoCobro; pagadoEn: { gte: Date; lt: Date } };

/** HTTP real de Nest con DI/controlador/servicio/repositorio/pipes/guards.
 * Prisma, catálogo de usuarios y verificación JWT simulados antes de init().
 * El mock modela resultados conocidos: NO ejecuta SQL ni comprueba PostgreSQL.
 */
describe('H27 ingresos y detalle HTTP con Prisma simulado', () => {
    let app: INestApplication;
    let datos: CobroPrueba[];
    const tx = { cobro: { count: vi.fn(), findMany: vi.fn() } };
    const prisma = { $queryRaw: vi.fn(), $transaction: vi.fn() };
    const roles = new Map([['admin', Rol.ADMINISTRADOR], ['miembro', Rol.MIEMBRO], ['entrenador', Rol.ENTRENADOR], ['recepcion', Rol.RECEPCION]]);
    beforeAll(async () => {
        const modulo = await Test.createTestingModule({ imports: [PrismaModule, ReportesModule] })
            .overrideProvider(PrismaService).useValue(prisma).compile();
        app = modulo.createNestApplication({ logger: false });
        app.setGlobalPrefix('api/v1');
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
        const reflector = modulo.get(Reflector);
        const jwt = { verifyAsync: vi.fn(async (token: string) => {
            if (token === 'invalido') throw new Error('JWT inválido');
            return { sub: token };
        }) };
        const users = { findById: vi.fn(async (sub: string) => roles.has(sub) ? { id: sub, rol: roles.get(sub), isActive: true } : null) };
        app.useGlobalGuards(new JwtAuthGuard(reflector, jwt as unknown as JwtService, users as unknown as UsersService), new RolesGuard(reflector));
        await app.init();
    });
    afterAll(async () => { if (app) await app.close(); });
    beforeEach(() => {
        vi.resetAllMocks();
        vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-18T16:00:00Z'));
        datos = [
            pago(1, 'MEMBRESIA', '500', '2026-11-18T06:00:00Z', 'MENSUAL'),
            pago(2, 'RENOVACION', '400', '2026-11-19T02:00:00Z', 'SET_CLASES'),
            pago(3, 'SESION_ADICIONAL', '230', '2026-11-19T05:59:59.999Z'),
            pago(4, 'SESION_ADICIONAL', '900', '2026-11-18T05:59:59.999Z'), // anterior: 17/11 local
            pago(5, 'MEMBRESIA', '999', '2026-11-19T06:00:00Z', 'DAYPASS'), // siguiente: fuera
            { ...pago(6, 'MEMBRESIA', '888', '2026-11-18T16:00:00Z'), estado: EstadoCobro.PENDIENTE, pagadoEn: null },
        ];
        prisma.$queryRaw.mockImplementation(async (plantilla: TemplateStringsArray, ...limites: Date[]) => {
            const sql = plantilla.join('?');
            if (sql.includes('FROM clase c')) return [{ tipo_clase_id: id(100), tipo_clase: 'Yoga', entrenador_id: id(101),
                entrenador: 'Carlos Martínez', veces: 2n, reservas: 10n, cupo: 20n }];
            // Se comprueba el contrato SQL aparte de modelar sus resultados.
            expect(sql).toContain("c.estado = 'PAGADO'");
            expect(sql).toContain('c.pagado_en >= ?'); expect(sql).toContain('c.pagado_en < ?');
            const filas = new Map<string, FilaIngreso>();
            for (const c of datos) {
                if (c.estado !== EstadoCobro.PAGADO || !c.pagadoEn || c.pagadoEn < limites[0]! || c.pagadoEn >= limites[1]!) continue;
                const fecha = hoyLocal(c.pagadoEn);
                const tipoPlan = c.concepto === ConceptoCobro.SESION_ADICIONAL ? null : c.tipoPlanHistorico;
                const clave = `${fecha}|${c.concepto}|${tipoPlan}`;
                const anterior = filas.get(clave)?.total ?? new Prisma.Decimal(0);
                filas.set(clave, { concepto: c.concepto, tipoPlan, fecha, total: anterior.plus(c.monto) });
            }
            return [...filas.values()];
        });
        const filtrar = (where: Filtro) => datos.filter((c) => c.estado === where.estado && c.concepto === where.concepto
            && c.pagadoEn && c.pagadoEn >= where.pagadoEn.gte && c.pagadoEn < where.pagadoEn.lt);
        tx.cobro.count.mockImplementation(async ({ where }: { where: Filtro }) => filtrar(where).length);
        tx.cobro.findMany.mockImplementation(async ({ where, skip, take }: { where: Filtro; skip: number; take: number }) =>
            filtrar(where).sort((a, b) => b.pagadoEn!.getTime() - a.pagadoEn!.getTime() || a.id.localeCompare(b.id)).slice(skip, skip + take));
        prisma.$transaction.mockImplementation((operar: (cliente: typeof tx) => Promise<unknown>) => operar(tx));
    });
    afterEach(() => vi.useRealTimers());
    const api = () => request(app.getHttpServer());
    const rango = { desde: '2026-11-18', hasta: '2026-11-18' };
    const ingresos = () => api().get('/api/v1/reportes/ingresos').query(rango).auth('admin', { type: 'bearer' });
    const detalle = (concepto = 'MEMBRESIA', pagina = '1') => api().get('/api/v1/reportes/ingresos/detalle')
        .query({ ...rango, concepto, pagina }).auth('admin', { type: 'bearer' });

    it('200: tres cobros pagados, creadoEn distinto, intentos fallidos excluidos y límites UTC-6', async () => {
        const res = await ingresos().expect(200);
        expect(res.body).toEqual({ total: 1130, subtotal: 1000, iva: 130,
            porConcepto: [{ concepto: 'MEMBRESIA', total: 500 }, { concepto: 'RENOVACION', total: 400 }, { concepto: 'SESION_ADICIONAL', total: 230 }],
            porTipoPlan: [{ tipoPlan: 'DAYPASS', total: 0 }, { tipoPlan: 'MENSUAL', total: 500 }, { tipoPlan: 'SET_CLASES', total: 400 }],
            porDia: [{ fecha: '2026-11-18', total: 1130 }], anterior: { total: 900, diferencia: 230, porcentaje: 25.6 },
        });
        expect(prisma.$queryRaw).toHaveBeenCalledOnce();
        expect(prisma.$queryRaw.mock.calls[0]!.slice(1)).toEqual([new Date('2026-11-17T06:00:00Z'), new Date('2026-11-19T06:00:00Z')]);
    });
    it('todos los días, incluido el día sin ingresos, en orden ascendente', async () => {
        datos = datos.filter((c) => c.id === id(1));
        const res = await api().get('/api/v1/reportes/ingresos').query({ desde: '2026-11-18', hasta: '2026-11-19' }).auth('admin', { type: 'bearer' }).expect(200);
        expect(res.body.porDia).toEqual([{ fecha: '2026-11-18', total: 500 }, { fecha: '2026-11-19', total: 0 }]);
        expect(res.body.anterior).toEqual({ total: 0, diferencia: 500, porcentaje: null });
    });
    it('sin ingresos en ambos períodos da ceros y null, no un error', async () => {
        datos = [];
        const res = await ingresos().expect(200);
        expect(res.body).toMatchObject({ total: 0, subtotal: 0, iva: 0, anterior: { total: 0, diferencia: 0, porcentaje: null } });
    });
    it('detalle 200 con referencia del comprobante, un pago pese a varios intentos, y campos públicos exactos', async () => {
        const res = await detalle().expect(200);
        expect(res.body).toEqual({ items: [{ miembro: 'Ana Martínez', codigo: 'MBR-000001', fecha: '2026-11-18', monto: 500, referencia: 'PAY-20261118-000001' }], total: 1, pagina: 1 });
        for (const dato of ['intentos', 'comprobante', 'cobroId', 'ultimos4', 'email', 'rechazado-no-publico', 'error-no-publico']) expect(JSON.stringify(res.body)).not.toContain(dato);
        expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'RepeatableRead' });
    });
    it('detalle fecha UTC del día siguiente corresponde a día local anterior', async () => {
        const res = await detalle('RENOVACION').expect(200);
        expect(res.body.items[0]).toMatchObject({ fecha: '2026-11-18', monto: 400, referencia: 'PAY-20261118-000002' });
    });
    it('25 pagos, orden estable con empates: páginas de 20/5 y página vacía con total 25', async () => {
        datos = Array.from({ length: 25 }, (_, i) => pago(i + 1, 'MEMBRESIA', '35.50', '2026-11-18T16:00:00Z', 'MENSUAL')).reverse();
        const primera = await detalle().expect(200);
        const segunda = await detalle('MEMBRESIA', '2').expect(200);
        const vacia = await detalle('MEMBRESIA', '3').expect(200);
        expect(primera.body).toMatchObject({ total: 25, pagina: 1 }); expect(primera.body.items).toHaveLength(20);
        expect(segunda.body).toMatchObject({ total: 25, pagina: 2 }); expect(segunda.body.items).toHaveLength(5);
        expect(primera.body.items[0].referencia).toBe('PAY-20261118-000001');
        expect(primera.body.items[19].referencia).toBe('PAY-20261118-000020');
        expect(segunda.body.items[0].referencia).toBe('PAY-20261118-000021');
        expect(segunda.body.items[4].referencia).toBe('PAY-20261118-000025');
        expect(vacia.body).toEqual({ items: [], total: 25, pagina: 3 });
    });
    it('ordena primero por fecha de pago descendente, después por id ascendente', async () => {
        datos = [pago(1, 'MEMBRESIA', '10', '2026-11-18T07:00:00Z'), pago(2, 'MEMBRESIA', '20', '2026-11-18T08:00:00Z')];
        const res = await detalle().expect(200);
        expect(res.body.items.map((p: { monto: number }) => p.monto)).toEqual([20, 10]);
        expect(tx.cobro.findMany.mock.calls[0]![0].orderBy).toEqual([{ pagadoEn: 'desc' }, { id: 'asc' }]);
    });
    it('comparte últimos 30 días por defecto en ambos endpoints', async () => {
        const res = await api().get('/api/v1/reportes/ingresos').auth('admin', { type: 'bearer' }).expect(200);
        expect(res.body.porDia).toHaveLength(30); expect(res.body.porDia[0].fecha).toBe('2026-10-20');
        const pagina = await api().get('/api/v1/reportes/ingresos/detalle').query({ concepto: 'MEMBRESIA' }).auth('admin', { type: 'bearer' }).expect(200);
        expect(pagina.body.pagina).toBe(1);
        expect(tx.cobro.count).toHaveBeenCalledWith({ where: { estado: 'PAGADO', concepto: 'MEMBRESIA',
            pagadoEn: { gte: new Date('2026-10-20T06:00:00Z'), lt: new Date('2026-11-19T06:00:00Z') } } });
    });
    it.each([
        { desde: '2026-11-20', hasta: '2026-11-19' }, { desde: '2026-02-30', hasta: '2026-03-01' },
        { desde: '2026-01-01', hasta: '2027-01-01' }, { desde: 'ayer' }, { hasta: '' },
    ])('400 en ambos endpoints por rango inválido %j antes de consultar', async (query) => {
        await api().get('/api/v1/reportes/ingresos').query(query).auth('admin', { type: 'bearer' }).expect(400);
        await api().get('/api/v1/reportes/ingresos/detalle').query({ ...query, concepto: 'MEMBRESIA' }).auth('admin', { type: 'bearer' }).expect(400);
        expect(prisma.$queryRaw).not.toHaveBeenCalled(); expect(prisma.$transaction).not.toHaveBeenCalled();
    });
    it.each([{}, { concepto: 'OTRO' }, { concepto: 'MEMBRESIA', pagina: '0' }, { concepto: 'MEMBRESIA', pagina: '1.5' },
        { concepto: 'MEMBRESIA', pagina: '-1' }, { concepto: 'MEMBRESIA', pagina: 'abc' }, { concepto: 'MEMBRESIA', pagina: '' }])('400 por concepto/página inválidos %j', async (query) => {
        await api().get('/api/v1/reportes/ingresos/detalle').query(query).auth('admin', { type: 'bearer' }).expect(400);
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });
    it.each(['miembro', 'entrenador', 'recepcion'])('403 para %s en H27 y H26 antes de consultar', async (rol) => {
        for (const ruta of ['ingresos', 'ingresos/detalle?concepto=MEMBRESIA', 'ocupacion']) {
            await api().get(`/api/v1/reportes/${ruta}`).auth(rol, { type: 'bearer' }).expect(403);
        }
        expect(prisma.$queryRaw).not.toHaveBeenCalled(); expect(prisma.$transaction).not.toHaveBeenCalled();
    });
    it.each(['ingresos', 'ingresos/detalle?concepto=MEMBRESIA'])('401 sin sesión o con token inválido en %s', async (ruta) => {
        await api().get(`/api/v1/reportes/${ruta}`).expect(401);
        await api().get(`/api/v1/reportes/${ruta}`).auth('invalido', { type: 'bearer' }).expect(401);
        expect(prisma.$queryRaw).not.toHaveBeenCalled(); expect(prisma.$transaction).not.toHaveBeenCalled();
    });
    it('regresión H26: el endpoint de ocupación conserva su contrato, cálculo y rol', async () => {
        const res = await api().get('/api/v1/reportes/ocupacion').query(rango).auth('admin', { type: 'bearer' }).expect(200);
        expect(res.body).toEqual({ desde: rango.desde, hasta: rango.hasta, filas: [{
            tipoClase: { id: id(100), nombre: 'Yoga' }, entrenador: { id: id(101), nombre: 'Carlos Martínez' },
            vecesImpartida: 2, reservasConfirmadas: 10, cupoTotal: 20, ocupacion: 50, etiqueta: null,
        }] });
    });
});
