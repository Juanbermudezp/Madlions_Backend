import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { JwtAuthGuard, RolesGuard } from '@Auth/guards';
import type { UsersService } from '@Users/services';
import { PrismaModule } from '@Prisma';
import { PrismaService } from '@Prisma/services';
import { Rol } from '@PrismaClient';
import { ReportesModule } from '../../src/reportes/index.js';
import { AHORA_H28, ESPERADO_H28, originalesH28, RANGO_H28 } from './h28-fixtures.js';

type CobroQA = { referenciaId: string; miembroId: string; referenciaTipo: string; concepto: string; estado: string; pagadoEn: string | null };
type RenovacionQA = { id: string; anterior: string; miembroId: string; estado: string; cobro: CobroQA };
const cobro = (id: string, pagadoEn: string | null, estado = 'PAGADO'): CobroQA => ({ referenciaId: id, miembroId: 'miembro', referenciaTipo: 'MEMBRESIA', concepto: 'RENOVACION', estado, pagadoEn });
const renovacion = (original: string, pago: string | null, estadoCobro = 'PAGADO'): RenovacionQA => ({ id: `r-${original}`, anterior: original, miembroId: 'miembro', estado: estadoCobro === 'PAGADO' ? 'PAGADA' : 'PENDIENTE_PAGO', cobro: cobro(`r-${original}`, pago, estadoCobro) });
const membresia = () => ({ ...originalesH28()[0]!, tipoPlan: 'MENSUAL', estado: 'PAGADA', fechaVencimiento: '2026-10-10' as string | null,
    cobro: { ...cobro('M1', '2026-09-01T16:00:00Z'), concepto: 'MEMBRESIA' }, renovaciones: [] as RenovacionQA[] });

/** Nest HTTP real con controladores/DI/servicio/repositorio/guards/pipes.
 * Prisma/JWT/usuarios simulados. El modelo de la consulta NO ejecuta SQL:
 * las ventanas y relaciones SQL se inspeccionan además en repository.spec.
 */
describe('H28 HTTP con Prisma simulado', () => {
    let app: INestApplication;
    let datos: ReturnType<typeof membresia>[];
    const prisma = { $queryRaw: vi.fn() };
    beforeAll(async () => {
        const modulo = await Test.createTestingModule({ imports: [PrismaModule, ReportesModule] })
            .overrideProvider(PrismaService).useValue(prisma).compile();
        app = modulo.createNestApplication({ logger: false }); app.setGlobalPrefix('api/v1');
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
        const roles = new Map([['admin', Rol.ADMINISTRADOR], ['miembro', Rol.MIEMBRO], ['entrenador', Rol.ENTRENADOR], ['recepcion', Rol.RECEPCION]]);
        const jwt = { verifyAsync: vi.fn(async (token: string) => { if (!roles.has(token)) throw new Error('inválido'); return { sub: token }; }) };
        const users = { findById: vi.fn(async (id: string) => roles.has(id) ? { id, rol: roles.get(id), isActive: true } : null) };
        const reflector = modulo.get(Reflector);
        app.useGlobalGuards(new JwtAuthGuard(reflector, jwt as unknown as JwtService, users as unknown as UsersService), new RolesGuard(reflector));
        await app.init();
    });
    afterAll(async () => { if (app) await app.close(); });
    beforeEach(() => {
        vi.resetAllMocks(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(AHORA_H28);
        const pagos: Record<string, string> = { M1: '2026-10-10T16:00:00Z', M2: '2026-10-19T16:00:00Z', M8: '2026-10-20T16:00:00Z', M9: '2026-10-22T16:00:00Z', M3: '2026-10-23T16:00:00Z' };
        datos = originalesH28().map((f) => ({ ...membresia(), ...f, tipoPlan: f.plan === 'Mensual' ? 'MENSUAL' : 'SET_CLASES',
            cobro: { ...cobro(f.id, '2026-09-01T16:00:00Z'), concepto: 'MEMBRESIA' },
            renovaciones: pagos[f.id] ? [renovacion(f.id, pagos[f.id])] : f.id === 'M5' ? [renovacion(f.id, null, 'PENDIENTE')] : [],
        }));
        datos.push({ ...membresia(), id: 'M7', nombre: 'Elena Cruz', codigo: 'MBR-000060', tipoPlan: 'DAYPASS', fechaVencimiento: '2026-10-15', cobro: { ...cobro('M7', '2026-09-01T16:00:00Z'), concepto: 'MEMBRESIA' } },
            { ...membresia(), id: 'M10', nombre: 'Raúl Pineda', codigo: 'MBR-000061', fechaVencimiento: '2026-09-15', cobro: { ...cobro('M10', '2026-09-01T16:00:00Z'), concepto: 'MEMBRESIA' } });
        prisma.$queryRaw.mockImplementation(async (_sql: TemplateStringsArray, ahora: Date, desde: string, hasta: string) => datos.flatMap((m) => {
            const vence = m.fechaVencimiento; const c = m.cobro;
            if (!vence || !['MENSUAL', 'SET_CLASES'].includes(m.tipoPlan) || m.estado !== 'PAGADA' || vence < desde || vence > hasta
                || c.estado !== 'PAGADO' || !c.pagadoEn || new Date(c.pagadoEn) > ahora || c.referenciaId !== m.id || c.miembroId !== 'miembro') return [];
            // Oráculo de la simulación basado en días locales, independiente
            // de la implementación SQL (que se valida en PostgreSQL pendiente).
            const renovada = m.renovaciones.some((r) => {
                const cr = r.cobro;
                if (!cr.pagadoEn) return false;
                const pago = new Date(cr.pagadoEn);
                const dia = new Date(pago.getTime() - 21600000).toISOString().slice(0, 10);
                const diferencia = (Date.parse(dia) - Date.parse(vence)) / 86400000;
                return r.anterior === m.id && r.miembroId === 'miembro' && r.estado === 'PAGADA' && cr.estado === 'PAGADO'
                    && cr.referenciaTipo === 'MEMBRESIA' && cr.concepto === 'RENOVACION' && cr.referenciaId === r.id && cr.miembroId === r.miembroId
                    && diferencia >= 0 && diferencia <= 7 && pago <= ahora;
            });
            return [{ id: m.id, nombre: m.nombre, codigo: m.codigo, plan: m.plan, fechaVencimiento: vence, renovada }];
        }));
    });
    afterEach(() => vi.useRealTimers());
    const api = () => request(app.getHttpServer()).get('/api/v1/reportes/renovacion');
    const consultar = () => api().query(RANGO_H28).auth('admin', { type: 'bearer' });
    it('C1–C4: matriz M1–M10 oficial produce contrato exacto; Daypass/fuera del rango excluidos', async () => {
        expect((await consultar().expect(200)).body).toEqual(ESPERADO_H28);
        expect(prisma.$queryRaw).toHaveBeenCalledOnce();
    });
    it.each([
        ['M1', 1, 0, 0], ['M2', 1, 0, 0], ['M8', 1, 0, 0], ['M9', 1, 0, 0],
        ['M3', 0, 1, 0], ['M4', 0, 1, 0], ['M5', 0, 1, 0], ['M6', 0, 0, 1], ['M7', 0, 0, 0], ['M10', 0, 0, 0],
    ])('oficial%s aislada ->renovadas%s/canceladas%s/enPeriodo%s', async (id, renovadas, canceladas, enPeriodo) => {
        datos = datos.filter((m) => m.id === id);
        const res = await consultar().expect(200);
        expect(res.body).toMatchObject({ renovadas, canceladas, enPeriodo });
        expect(res.body.noRenovaron).toHaveLength(canceladas);
    });
    it.each([
        ['2026-10-10T06:00:00Z', 1, 0], // día0 primer instante
        ['2026-10-18T05:59:59.999Z', 1, 0], // día7 último instante local
        ['2026-10-18T06:00:00Z', 0, 1], // día8 primer instante
        ['2026-10-10T05:59:59.999Z', 0, 1], // antes del día0
    ])('C2 límite de pago%s ->renovadas%s/canceladas%s', async (pago, r, c) => {
        datos = [{ ...membresia(), renovaciones: [renovacion('M1', pago)] }];
        expect((await consultar().expect(200)).body).toMatchObject({ renovadas: r, canceladas: c, enPeriodo: 0 });
    });
    it.each(['pendiente', 'sinFecha', 'otroOrigen', 'otroMiembro', 'cobroAjeno', 'sesion', 'intentoAprobadoSolo', 'membresiaPendiente'])('renovación%s no basta para contar como pagada válida', async (caso) => {
        const r = renovacion('M1', '2026-10-10T16:00:00Z');
        if (caso === 'pendiente' || caso === 'intentoAprobadoSolo') r.cobro.estado = 'PENDIENTE';
        if (caso === 'sinFecha') r.cobro.pagadoEn = null;
        if (caso === 'otroOrigen') r.anterior = 'otra';
        if (caso === 'otroMiembro') r.miembroId = 'otro';
        if (caso === 'cobroAjeno') r.cobro.referenciaId = 'otra';
        if (caso === 'sesion') r.cobro.referenciaTipo = 'SESION';
        if (caso === 'membresiaPendiente') r.estado = 'PENDIENTE_PAGO';
        datos = [{ ...membresia(), renovaciones: [r] }];
        expect((await consultar().expect(200)).body).toMatchObject({ renovadas: 0, canceladas: 1 });
    });
    it('varias renovaciones no duplican original; basta una pagada válida', async () => {
        datos = [{ ...membresia(), renovaciones: [renovacion('M1', null, 'PENDIENTE'), renovacion('M1', '2026-10-10T16:00:00Z'), renovacion('M1', '2026-10-11T16:00:00Z')] }];
        expect((await consultar().expect(200)).body).toMatchObject({ renovadas: 1, canceladas: 0, enPeriodo: 0 });
    });
    it('original pendiente, sin cobro PAGADO o vencimientoNULL no se considera', async () => {
        const a = membresia(); a.estado = 'PENDIENTE_PAGO';
        const b = membresia(); b.cobro.estado = 'PENDIENTE';
        datos = [a, b, { ...membresia(), fechaVencimiento: null }];
        expect((await consultar().expect(200)).body).toEqual({ renovadas: 0, canceladas: 0, enPeriodo: 0, tasaRenovacion: null, tasaCancelacion: null, noRenovaron: [] });
    });
    it('C6:solo gracia y fechasDATE/rango inclusivas sin restar un día', async () => {
        datos = [{ ...membresia(), fechaVencimiento: '2026-11-06' }];
        expect((await api().query({ desde: '2026-11-06', hasta: '2026-11-06' }).auth('admin', { type: 'bearer' }).expect(200)).body)
            .toEqual({ renovadas: 0, canceladas: 0, enPeriodo: 1, tasaRenovacion: null, tasaCancelacion: null, noRenovaron: [] });
    });
    it('pago futuro no adelanta clasificación; gracia termina al cambiar el día local', async () => {
        datos = [{ ...membresia(), fechaVencimiento: '2026-11-02', renovaciones: [renovacion('M1', '2026-11-07T16:00:00Z')] }];
        expect((await consultar().expect(200)).body).toMatchObject({ renovadas: 0, enPeriodo: 1 });
    });
    it('últimos30d por defecto y12meses máximos válidos', async () => {
        await api().auth('admin', { type: 'bearer' }).expect(200);
        expect(prisma.$queryRaw.mock.calls[0]!.slice(1)).toEqual([AHORA_H28, '2026-10-08', '2026-11-06', AHORA_H28]);
        await api().query({ desde: '2026-01-01', hasta: '2026-12-31' }).auth('admin', { type: 'bearer' }).expect(200);
    });
    it.each([{ desde: '2026-11-07', hasta: '2026-11-06' }, { desde: '2026-02-30' }, { desde: '2026-01-01', hasta: '2027-01-01' }, { desde: 'ayer' }, { hasta: '' }, { otro: '1' }])('C7:400 rango/query inválido%j sin consultar', async (query) => {
        await api().query(query).auth('admin', { type: 'bearer' }).expect(400);
        expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });
    it.each(['miembro', 'entrenador', 'recepcion'])('C7:403 rol%s', async (rol) => {
        await api().auth(rol, { type: 'bearer' }).expect(403); expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });
    it('C7:401 sin token y token inválido', async () => {
        await api().expect(401); await api().auth('invalido', { type: 'bearer' }).expect(401); expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });
    it('fallo de consulta devuelve500, no tasas vacías engañosas', async () => {
        prisma.$queryRaw.mockRejectedValue(new Error('offline')); await consultar().expect(500);
    });
});
