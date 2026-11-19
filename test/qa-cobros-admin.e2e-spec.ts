/**
 * QA-13.1 · Criterios de aceptación de H13 (consulta de cobros pendientes).
 *
 * Contra la base real del docker-compose. Crea sus propios miembros (apellido
 * "QA13 <corrida>") y cobros, y borra todo al terminar. Para que los cobros
 * del seed o de otras pruebas no cambien los totales, casi todas las
 * consultas buscan por ese apellido (q) o por el código de un miembro.
 *
 * - Los cobros de SESION_ADICIONAL, la renovación anticipada y los cobros
 *   pagados para el orden se crean directo en la tabla `cobro`.
 * - El pago aprobado y el rechazado pasan por la API real (H12), con una
 *   membresía registrada por recepción.
 *
 * Requisitos: migraciones aplicadas y `npm run db:seed`.
 * Detalle de los casos: docs/qa/H13-pruebas-cobros-pendientes.md
 */
import { randomInt, randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { ESPERA_PASARELA_MS } from '@Cobros/services';
import { hoyLocal, sumarDias } from '@Common/fechas';
import { PrismaService } from '@Prisma/services';
import { ConceptoCobro, EstadoCobro, ReferenciaCobro, TipoPlan } from '@PrismaClient';

const ACCESO_DENEGADO = 'Acceso denegado';
const TARJETAS = { aprueba: '4242424242424242', rechaza: '4000000000000002' };

interface Item {
    id: string;
    miembro: { nombre: string; codigo: string };
    concepto: string;
    detalle: string;
    monto: number;
    creadoEn: string;
    habilitado: boolean;
    habilitadoDesde: string | null;
    pagadoEn: string | null;
    referencia?: string;
}
interface Pagina {
    items: Item[];
    total: number;
    sumaMontos: number;
    pagina: number;
}

describe('QA-13.1 · Consulta de cobros pendientes (H13)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    const corrida = randomUUID().slice(0, 6);
    const etiqueta = `QA13 ${corrida}`;
    const base = randomInt(100_000, 899_000);
    const hoy = hoyLocal();
    const m: { id: string; usuarioId: string; email: string; codigo: string; token: string }[] = [];
    const tokens = {} as Record<'admin' | 'miembro' | 'entrenador' | 'recepcion', string>;
    let planId: string;
    /** Cobros de membresía registrados por recepción (miembros 2 y 3). */
    const membresia: Record<number, string> = {};

    const http = () => request(app.getHttpServer());
    const login = async (email: string) => {
        const res = await http().post('/api/v1/auth/login').send({ email, password: 'Demo1234!' });
        if (res.status !== 200) throw new Error(`No se pudo iniciar sesión con ${email}: corre npm run db:seed`);
        return (res.body as { accessToken: string }).accessToken;
    };
    const consultar = (query: Record<string, string | number>, token = tokens.admin) =>
        http().get('/api/v1/cobros').query(query).set('Authorization', `Bearer ${token}`);
    /** Consulta como administrador y comprueba el 200. */
    const listar = async (query: Record<string, string | number>): Promise<Pagina> => {
        const res = await consultar(query);
        expect(res.status).toBe(200);
        return res.body as Pagina;
    };
    const pagar = (i: number, numero: string) =>
        http()
            .post(`/api/v1/cobros/${membresia[i]}/pagar`)
            .set('Authorization', `Bearer ${m[i].token}`)
            .send({ titular: 'Prueba QA', numero, vencimiento: '12/30', cvv: '731' });

    /** Cobro creado directo en la tabla (sin pasar por el módulo que lo origina). */
    const cobro = (i: number, concepto: ConceptoCobro, monto: number, extra: Record<string, unknown> = {}) =>
        prisma.cobro.create({
            data: {
                miembroId: m[i].id,
                concepto,
                detalle: `[QA-13.1] ${concepto} ${corrida}`,
                monto,
                // La base exige SESION para las sesiones adicionales y MEMBRESIA para lo demás.
                referenciaTipo: concepto === ConceptoCobro.SESION_ADICIONAL ? ReferenciaCobro.SESION : ReferenciaCobro.MEMBRESIA,
                // Nunca se pagan por la API, así que la referencia no necesita existir.
                referenciaId: randomUUID(),
                ...extra,
            },
        });

    beforeAll(async () => {
        const ref = await Test.createTestingModule({ imports: [AppModule] })
            .overrideProvider(ESPERA_PASARELA_MS)
            .useValue(200)
            .compile();
        app = ref.createNestApplication();
        app.setGlobalPrefix('api/v1');
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
        await app.init();
        prisma = app.get(PrismaService);

        tokens.admin = await login('admin@madlions.com');
        tokens.miembro = await login('miembro@madlions.com');
        tokens.entrenador = await login('entrenador@madlions.com');
        tokens.recepcion = await login('recepcion@madlions.com');

        // Seis miembros. El 0 lleva tilde en el apellido para probar la búsqueda sin tildes.
        const { passwordHash } = await prisma.user.findUniqueOrThrow({ where: { email: 'miembro@madlions.com' } });
        for (let i = 0; i < 6; i++) {
            const n = base + i;
            const email = `qa131-${corrida}-${i}@test.com`;
            const usuario = await prisma.user.create({
                data: {
                    email, passwordHash, nombre: 'Prueba',
                    apellido: i === 0 ? `Núñez ${etiqueta} ${i}` : `${etiqueta} ${i}`,
                    telefono: String(73_000_000 + n).slice(0, 8),
                },
            });
            const codigo = `MBR-${String(n).padStart(6, '0')}`;
            const miembro = await prisma.miembro.create({
                data: { usuarioId: usuario.id, documento: `${String(n).padStart(8, '0')}-${i % 10}`, codigoMiembro: codigo },
            });
            m.push({ id: miembro.id, usuarioId: usuario.id, email, codigo, token: await login(email) });
        }

        planId = (await prisma.plan.create({
            data: { nombre: `[QA-13.1] Mensual ${corrida}`, tipo: TipoPlan.MENSUAL, precio: 40, duracionDias: 30, beneficios: 'QA H13' },
        })).id;

        // Pendientes: miembro 0 → membresía 35.50 + sesión 12.50.
        await cobro(0, ConceptoCobro.MEMBRESIA, 35.5);
        await cobro(0, ConceptoCobro.SESION_ADICIONAL, 12.5);
        // Miembro 1 → renovación anticipada (se habilita en 10 días) 30.00 + membresía 20.00.
        await cobro(1, ConceptoCobro.RENOVACION, 30, { habilitadoDesde: new Date(`${sumarDias(hoy, 10)}T00:00:00Z`) });
        await cobro(1, ConceptoCobro.MEMBRESIA, 20);
        // Miembros 2 y 3 → membresía de 40.00 registrada por recepción (se pagan en el criterio 4).
        for (const i of [2, 3]) {
            const res = await http()
                .post('/api/v1/membresias')
                .set('Authorization', `Bearer ${tokens.recepcion}`)
                .send({ miembroId: m[i].id, planId });
            expect(res.status).toBe(201);
            membresia[i] = res.body.cobroId as string;
        }
        // Miembro 4 → 25 sesiones de 10.00 creadas con un minuto de diferencia (paginación y orden).
        const inicio = Date.now() - 60 * 60_000;
        for (let k = 0; k < 25; k++) {
            await cobro(4, ConceptoCobro.SESION_ADICIONAL, 10, {
                detalle: `[QA-13.1] Sesión ${String(k + 1).padStart(2, '0')} ${corrida}`,
                creadoEn: new Date(inicio + k * 60_000),
            });
        }
        // Miembro 5 → tres cobros ya pagados en días distintos (orden de Pagados).
        for (const dias of [3, 1, 2]) {
            await cobro(5, ConceptoCobro.MEMBRESIA, 15, {
                detalle: `[QA-13.1] Pagado hace ${dias} días ${corrida}`,
                estado: EstadoCobro.PAGADO,
                pagadoEn: new Date(Date.now() - dias * 86_400_000),
            });
        }
    }, 60_000);

    afterAll(async () => {
        const ids = m.map((x) => x.id);
        const deEllos = { cobro: { miembroId: { in: ids } } };
        await prisma.comprobante.deleteMany({ where: deEllos });
        await prisma.intentoPago.deleteMany({ where: deEllos });
        await prisma.cobro.deleteMany({ where: { miembroId: { in: ids } } });
        await prisma.membresia.deleteMany({ where: { miembroId: { in: ids } } });
        await prisma.plan.deleteMany({ where: { id: planId } });
        await prisma.miembro.deleteMany({ where: { id: { in: ids } } });
        await prisma.user.deleteMany({ where: { id: { in: m.map((x) => x.usuarioId) } } });
        await app.close();
    });

    describe('Criterio 1 · Filtros por estado y concepto, y búsqueda por nombre o código del miembro', () => {
        it('QA-01 · sin estado lista los PENDIENTES; con PAGADO, solo los pagados', async () => {
            const pendientes = await listar({ q: etiqueta });
            expect(pendientes.items.length).toBeGreaterThan(0);
            expect(pendientes.items.every((c) => c.pagadoEn === null)).toBe(true);

            const pagados = await listar({ q: etiqueta, estado: 'PAGADO' });
            expect(pagados.total).toBe(3);
            expect(pagados.items.every((c) => c.pagadoEn !== null)).toBe(true);
        });

        it.each([
            ['MEMBRESIA', 4],
            ['RENOVACION', 1],
            ['SESION_ADICIONAL', 26],
        ])('QA-02 · concepto %s: solo cobros de ese concepto', async (concepto, total) => {
            const res = await listar({ q: etiqueta, concepto });
            expect(res.total).toBe(total);
            expect(res.items.every((c) => c.concepto === concepto)).toBe(true);
        });

        it('QA-03 · búsqueda por código (completo o parcial, sin importar mayúsculas)', async () => {
            for (const q of [m[0].codigo, m[0].codigo.toLowerCase(), m[0].codigo.slice(4)]) {
                const res = await listar({ q });
                expect(res.total).toBe(2);
                expect(res.items.every((c) => c.miembro.codigo === m[0].codigo)).toBe(true);
            }
        });

        it('QA-04 · búsqueda por nombre y apellido, sin tildes ni mayúsculas', async () => {
            const res = await listar({ q: `prueba nunez qa13 ${corrida}` });
            expect(res.total).toBe(2);
            expect(res.items[0].miembro).toEqual({ nombre: `Prueba Núñez ${etiqueta} 0`, codigo: m[0].codigo });
        });

        it('QA-05 · una búsqueda sin coincidencias devuelve la lista vacía', async () => {
            await expect(listar({ q: `nadie-${corrida}` })).resolves.toEqual({ items: [], total: 0, sumaMontos: 0, pagina: 1 });
        });

        it.each([
            [{ estado: 'ANULADO' }, 'El estado debe ser PENDIENTE o PAGADO.'],
            [{ concepto: 'CLASE' }, 'El concepto debe ser MEMBRESIA, RENOVACION o SESION_ADICIONAL.'],
            [{ pagina: 0 }, 'La página debe ser un número entero mayor o igual que 1.'],
            [{ pagina: 'dos' }, 'La página debe ser un número entero mayor o igual que 1.'],
            [{ q: 'x'.repeat(101) }, 'La búsqueda puede tener hasta 100 caracteres.'],
            [{ miembroId: 'otro' }, 'property miembroId should not exist'],
        ])('QA-06 · filtro incorrecto %o: 400', async (query, mensaje) => {
            const res = await consultar(query);
            expect(res.status).toBe(400);
            expect([res.body.message].flat()).toContain(mensaje);
        });
    });

    describe('Criterio 2 · La cantidad y la suma corresponden al conjunto filtrado', () => {
        it.each([
            ['todos los pendientes', {}, 31, 428],
            ['membresías pendientes', { concepto: 'MEMBRESIA' }, 4, 135.5],
            ['sesiones adicionales pendientes', { concepto: 'SESION_ADICIONAL' }, 26, 262.5],
            ['renovaciones pendientes', { concepto: 'RENOVACION' }, 1, 30],
            ['pagados', { estado: 'PAGADO' }, 3, 45],
        ])('QA-07 · %s', async (_caso, filtros, total, suma) => {
            const res = await listar({ q: etiqueta, ...filtros });
            expect(res.total).toBe(total);
            expect(res.sumaMontos).toBeCloseTo(suma, 2);
        });

        it('QA-08 · los totales son de todo el conjunto, no solo de la página', async () => {
            const res = await listar({ q: m[4].codigo, pagina: 2 });
            expect(res.items).toHaveLength(5);
            expect(res.total).toBe(25);
            expect(res.sumaMontos).toBe(250);
        });
    });

    describe('Criterio 3 · Una renovación anticipada aparece como pendiente no habilitada', () => {
        it('QA-09 · habilitado false con su fecha de habilitación', async () => {
            const { items } = await listar({ q: m[1].codigo, concepto: 'RENOVACION' });
            expect(items).toEqual([
                expect.objectContaining({ concepto: 'RENOVACION', habilitado: false, habilitadoDesde: sumarDias(hoy, 10), pagadoEn: null }),
            ]);
        });

        it('QA-10 · los demás pendientes están habilitados desde que se generan', async () => {
            const { items } = await listar({ q: m[0].codigo });
            expect(items.every((c) => c.habilitado && c.habilitadoDesde === null)).toBe(true);
        });
    });

    describe('Criterio 4 · Un pago aprobado pasa de Pendientes a Pagados; uno rechazado sigue pendiente', () => {
        it('QA-11 · pago aprobado: sale de Pendientes y aparece en Pagados con su referencia', async () => {
            expect((await listar({ q: m[2].codigo })).total).toBe(1);

            const pago = await pagar(2, TARJETAS.aprueba);
            expect(pago.status).toBe(200);
            expect(pago.body.resultado).toBe('APROBADO');

            expect(await listar({ q: m[2].codigo })).toMatchObject({ total: 0, sumaMontos: 0 });
            const pagados = await listar({ q: m[2].codigo, estado: 'PAGADO' });
            expect(pagados.total).toBe(1);
            expect(pagados.items[0]).toMatchObject({ id: membresia[2], monto: 40, habilitado: false, referencia: pago.body.referencia });
            expect(pagados.items[0].pagadoEn).not.toBeNull();
        });

        it('QA-12 · pago rechazado: sigue en Pendientes y no aparece en Pagados', async () => {
            const pago = await pagar(3, TARJETAS.rechaza);
            expect(pago.status).toBe(200);
            expect(pago.body.resultado).toBe('RECHAZADO');

            const pendientes = await listar({ q: m[3].codigo });
            expect(pendientes.total).toBe(1);
            expect(pendientes.items[0]).toMatchObject({ id: membresia[3], habilitado: true });
            expect((await listar({ q: m[3].codigo, estado: 'PAGADO' })).total).toBe(0);
        });

        it('QA-13 · los totales reflejan el pago aprobado', async () => {
            expect(await listar({ q: etiqueta })).toMatchObject({ total: 30, sumaMontos: 388 });
            expect(await listar({ q: etiqueta, estado: 'PAGADO' })).toMatchObject({ total: 4, sumaMontos: 85 });
        });
    });

    describe('Criterio 5 · Solo el ADMINISTRADOR puede consultar los cobros', () => {
        it.each(['miembro', 'entrenador', 'recepcion'] as const)('QA-14 · %s: 403 "Acceso denegado" sin datos', async (rol) => {
            const res = await consultar({}, tokens[rol]);
            expect(res.status).toBe(403);
            expect(res.body.message).toBe(ACCESO_DENEGADO);
            expect(res.body.items).toBeUndefined();
        });

        it('QA-15 · sin sesión: 401', async () => {
            expect((await http().get('/api/v1/cobros')).status).toBe(401);
        });

        it('QA-16 · el endpoint del miembro sigue funcionando (GET /cobros/mios)', async () => {
            const res = await http().get('/api/v1/cobros/mios').set('Authorization', `Bearer ${m[0].token}`);
            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(2);
        });
    });

    describe('Criterio 6 · Paginación de 20 y orden de la lista', () => {
        it('QA-17 · 25 cobros: 20 en la página 1, 5 en la 2 y ninguno en la 3', async () => {
            const [p1, p2, p3] = await Promise.all([1, 2, 3].map((pagina) => listar({ q: m[4].codigo, pagina })));
            expect(p1).toMatchObject({ pagina: 1, total: 25 });
            expect(p1.items).toHaveLength(20);
            expect(p2).toMatchObject({ pagina: 2, total: 25 });
            expect(p2.items).toHaveLength(5);
            expect(p3).toMatchObject({ pagina: 3, total: 25, items: [] });
            // Sin repetidos entre páginas.
            expect(new Set([...p1.items, ...p2.items].map((c) => c.id)).size).toBe(25);
        });

        it('QA-18 · pendientes: el más antiguo primero (creado_en ascendente)', async () => {
            const p1 = await listar({ q: m[4].codigo });
            const p2 = await listar({ q: m[4].codigo, pagina: 2 });
            const detalles = [...p1.items, ...p2.items].map((c) => c.detalle);
            expect(detalles[0]).toBe(`[QA-13.1] Sesión 01 ${corrida}`);
            expect(detalles[24]).toBe(`[QA-13.1] Sesión 25 ${corrida}`);
            const fechas = [...p1.items, ...p2.items].map((c) => c.creadoEn);
            expect(fechas).toEqual([...fechas].sort());
        });

        it('QA-19 · pagados: el pago más reciente primero (pagado_en descendente)', async () => {
            const { items } = await listar({ q: m[5].codigo, estado: 'PAGADO' });
            expect(items.map((c) => c.detalle)).toEqual([1, 2, 3].map((d) => `[QA-13.1] Pagado hace ${d} días ${corrida}`));
        });

        it('QA-20 · un cobro nuevo aparece en la siguiente consulta (lo que hace el panel cada 30 s o con "Actualizar")', async () => {
            const antes = await listar({ q: m[0].codigo });
            await cobro(0, ConceptoCobro.SESION_ADICIONAL, 7.25);
            const despues = await listar({ q: m[0].codigo });
            expect(despues.total).toBe(antes.total + 1);
            expect(despues.sumaMontos).toBeCloseTo(antes.sumaMontos + 7.25, 2);
        });
    });
});