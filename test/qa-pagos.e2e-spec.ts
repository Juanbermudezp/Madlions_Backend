/**
 * QA-12.1 · Verificación de los 8 criterios de aceptación de H12
 * (pago de membresía, renovación o sesión adicional).
 *
 * Contra la base real del docker-compose. Crea sus propios miembros (prefijo
 * qa121-) y planes, y borra todo al terminar. Cada bloque `describe` es un
 * criterio de aceptación.
 *
 * - Reloj simulado: solo se simula `Date`, para llegar al día del vencimiento
 *   y pagar la renovación (criterios 2 y 4).
 * - Sesión adicional: H9 todavía no está en develop; el cobro se genera con
 *   CobrosService.crearCobro() tal como lo hará H9 (QA-M1 queda manual).
 * - Logs: se captura todo lo que la API escribe en stdout/stderr para
 *   comprobar que nunca aparece la tarjeta (criterio 7).
 *
 * Requisitos: migraciones aplicadas y `npm run db:seed`.
 * Detalle de los casos: docs/qa/H12-pruebas-pagos.md
 */
import { randomInt, randomUUID } from 'node:crypto';
import { Logger, ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { CobrosService, ESPERA_PASARELA_MS } from '@Cobros/services';
import { hoyLocal, sumarDias } from '@Common/fechas';
import { PrismaService } from '@Prisma/services';
import { ConceptoCobro, ReferenciaCobro, TipoPlan } from '@PrismaClient';

const TARJETAS = {
    aprueba: '4242424242424242',
    rechaza: '4000000000000002',
    error: '4000000000000119',
    otra: '5555555555554444',
};
const CVV = '731';
const local = (dia: string, hora = '10:00') => new Date(`${dia}T${hora}:00-06:00`);

describe('QA-12.1 · Pago de membresía, renovación o sesión adicional (H12)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let cobros: CobrosService;
    const corrida = randomUUID().slice(0, 6);
    const base = randomInt(100_000, 899_000);
    const m: { id: string; usuarioId: string; email: string; token: string }[] = [];
    let tokenRecepcion: string;
    const planes = {} as Record<'mensual' | 'set', string>;
    const hoy = hoyLocal();
    let salida = '';
    const escribirOriginal = { out: process.stdout.write.bind(process.stdout), err: process.stderr.write.bind(process.stderr) };
    const METODOS_CONSOLA = ['log', 'info', 'warn', 'error', 'debug'] as const;
    const consolaOriginal = Object.fromEntries(METODOS_CONSOLA.map((k) => [k, console[k]])) as Record<(typeof METODOS_CONSOLA)[number], (...a: unknown[]) => void>;
    const MARCADOR = `marcador-de-captura-${randomUUID()}`;

    const http = () => request(app.getHttpServer());
    const login = async (email: string) => {
        const res = await http().post('/api/v1/auth/login').send({ email, password: 'Demo1234!' });
        if (res.status !== 200) throw new Error(`No se pudo iniciar sesión con ${email}: corre npm run db:seed`);
        return (res.body as { accessToken: string }).accessToken;
    };
    const mios = (i: number, estado?: string) =>
        http().get('/api/v1/cobros/mios').query(estado ? { estado } : {}).set('Authorization', `Bearer ${m[i].token}`);
    const pagar = (cobroId: string, i: number, numero: string) =>
        http()
            .post(`/api/v1/cobros/${cobroId}/pagar`)
            .set('Authorization', `Bearer ${m[i].token}`)
            .send({ titular: 'Prueba QA', numero, vencimiento: '12/30', cvv: CVV });
    const registrar = async (i: number, plan: keyof typeof planes) => {
        const res = await http()
            .post('/api/v1/membresias')
            .set('Authorization', `Bearer ${tokenRecepcion}`)
            .send({ miembroId: m[i].id, planId: planes[plan] });
        expect(res.status).toBe(201);
        return { membresiaId: res.body.id as string, cobroId: res.body.cobroId as string, tipo: res.body.tipoOperacion as string };
    };
    const sesionAdicional = (i: number) =>
        cobros.crearCobro({
            miembroId: m[i].id,
            concepto: ConceptoCobro.SESION_ADICIONAL,
            detalle: 'Sesión 20/11/2026 10:00 con Carlos Martínez',
            monto: 12.5,
            referenciaTipo: ReferenciaCobro.SESION,
            referenciaId: randomUUID(),
        });

    beforeAll(async () => {
        // Captura todo lo que se escribe en consola (sin dejar de mostrarlo):
        // console.* (Prisma y el código) y stdout/stderr (Logger de Nest).
        for (const metodo of METODOS_CONSOLA) {
            console[metodo] = (...args: unknown[]) => {
                salida += `${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a) ?? String(a))).join(' ')}\n`;
                consolaOriginal[metodo](...args);
            };
        }
        process.stdout.write = ((chunk: string | Uint8Array, ...resto: unknown[]) => {
            salida += String(chunk);
            return (escribirOriginal.out as (...a: unknown[]) => boolean)(chunk, ...resto);
        }) as typeof process.stdout.write;
        process.stderr.write = ((chunk: string | Uint8Array, ...resto: unknown[]) => {
            salida += String(chunk);
            return (escribirOriginal.err as (...a: unknown[]) => boolean)(chunk, ...resto);
        }) as typeof process.stderr.write;

        const ref = await Test.createTestingModule({ imports: [AppModule] })
            .overrideProvider(ESPERA_PASARELA_MS)
            .useValue(200)
            .compile();
        app = ref.createNestApplication();
        app.setGlobalPrefix('api/v1');
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
        await app.init();
        prisma = app.get(PrismaService);
        cobros = app.get(CobrosService);

        tokenRecepcion = await login('recepcion@madlions.com');
        const { passwordHash } = await prisma.user.findUniqueOrThrow({ where: { email: 'miembro@madlions.com' } });
        for (let i = 0; i < 7; i++) {
            const n = base + i;
            const email = `qa121-${corrida}-${i}@test.com`;
            const usuario = await prisma.user.create({
                data: { email, passwordHash, nombre: 'Prueba', apellido: `QA121 ${i}`, telefono: String(74_000_000 + n).slice(0, 8) },
            });
            const miembro = await prisma.miembro.create({
                data: { usuarioId: usuario.id, documento: `${String(n).padStart(8, '0')}-${i % 10}`, codigoMiembro: `MBR-${String(n).padStart(6, '0')}` },
            });
            m.push({ id: miembro.id, usuarioId: usuario.id, email, token: await login(email) });
        }
        const plan = (nombre: string, tipo: TipoPlan, precio: number, cantidadClases: number | null) =>
            prisma.plan.create({
                data: { nombre: `[QA-12.1] ${nombre} ${corrida}`, tipo, precio, cantidadClases, duracionDias: 30, beneficios: 'QA H12' },
            });
        planes.mensual = (await plan('Mensual', TipoPlan.MENSUAL, 35.5, null)).id;
        planes.set = (await plan('Set', TipoPlan.SET_CLASES, 50, 8)).id;
    });

    afterAll(async () => {
        process.stdout.write = escribirOriginal.out;
        process.stderr.write = escribirOriginal.err;
        for (const metodo of METODOS_CONSOLA) console[metodo] = consolaOriginal[metodo];
        vi.useRealTimers();
        const ids = m.map((x) => x.id);
        const deEllos = { cobro: { miembroId: { in: ids } } };
        await prisma.comprobante.deleteMany({ where: deEllos });
        await prisma.intentoPago.deleteMany({ where: deEllos });
        await prisma.cobro.deleteMany({ where: { miembroId: { in: ids } } });
        await prisma.membresia.deleteMany({ where: { miembroId: { in: ids }, membresiaAnteriorId: { not: null } } });
        await prisma.membresia.deleteMany({ where: { miembroId: { in: ids } } });
        await prisma.plan.deleteMany({ where: { nombre: { startsWith: '[QA-12.1]' } } });
        await prisma.miembro.deleteMany({ where: { id: { in: ids } } });
        await prisma.user.deleteMany({ where: { id: { in: m.map((x) => x.usuarioId) } } });
        await app.close();
    });

    describe('Criterio 1 · "Mis pagos" lista los cobros pendientes con concepto, detalle, monto y fecha de habilitación', () => {
        it('QA-01 · membresía, sesión adicional y renovación pendientes, con su detalle y monto', async () => {
            await registrar(0, 'mensual');
            await sesionAdicional(0);
            const res = await mios(0, 'PENDIENTE');
            expect(res.status).toBe(200);
            expect(res.body).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ concepto: 'MEMBRESIA', detalle: `[QA-12.1] Mensual ${corrida}`, monto: 35.5, estado: 'PENDIENTE' }),
                    expect.objectContaining({
                        concepto: 'SESION_ADICIONAL',
                        detalle: 'Sesión 20/11/2026 10:00 con Carlos Martínez',
                        monto: 12.5,
                    }),
                ]),
            );
        });

        it('QA-02 · una renovación muestra la fecha desde la que se puede pagar', async () => {
            const compra = await registrar(3, 'mensual');
            await pagar(compra.cobroId, 3, TARJETAS.aprueba);
            const renovacion = await registrar(3, 'mensual');
            expect(renovacion.tipo).toBe('RENOVACION');

            const res = await mios(3, 'PENDIENTE');
            expect(res.body).toEqual([expect.objectContaining({ concepto: 'RENOVACION', habilitadoDesde: sumarDias(hoy, 29) })]);
        });
    });

    describe('Criterio 2 · Compras y sesiones se pagan desde que se generan; la renovación, desde el vencimiento', () => {
        it('QA-03 · compra y sesión adicional: habilitadas desde que se generan', async () => {
            const res = await mios(0, 'PENDIENTE');
            expect(res.body.every((c: { habilitado: boolean; habilitadoDesde: string | null }) => c.habilitado && c.habilitadoDesde === null)).toBe(true);
        });

        it('QA-04 · renovación antes del vencimiento: no habilitada y el pago se rechaza con "No habilitado: podrás pagar desde el …"', async () => {
            const [renovacion] = (await mios(3, 'PENDIENTE')).body;
            expect(renovacion.habilitado).toBe(false);
            const res = await pagar(renovacion.id, 3, TARJETAS.aprueba);
            expect(res.status).toBe(409);
            expect(res.body.message).toBe(`No habilitado: podrás pagar desde el ${sumarDias(hoy, 29).split('-').reverse().join('/')}`);
            expect(await prisma.intentoPago.count({ where: { cobroId: renovacion.id } })).toBe(0);
        });
    });

    describe('Criterio 3 · La pasarela decide según la tarjeta: 4242 aprueba, 0002 rechaza, 0119 da error', () => {
        it.each([
            ['0002', TARJETAS.rechaza, 'RECHAZADO'],
            ['0119', TARJETAS.error, 'ERROR'],
            ['otra tarjeta válida (…4444)', TARJETAS.otra, 'RECHAZADO'],
        ])('QA-05 · %s → %s', async (_t, numero, resultado) => {
            const cobro = (await prisma.cobro.findFirst({ where: { miembroId: m[1].id, estado: 'PENDIENTE' } })) ?? (await prisma.cobro.findUniqueOrThrow({ where: { id: (await registrar(1, 'set')).cobroId } }));
            const res = await pagar(cobro.id, 1, numero);
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ resultado, mensaje: expect.any(String) });
        });

        it.each([
            ['membresía', 0, 'MEMBRESIA'],
            ['sesión adicional', 0, 'SESION_ADICIONAL'],
        ])('QA-06 · 4242 aprueba el pago de %s', async (_t, i, concepto) => {
            const cobro = await prisma.cobro.findFirstOrThrow({ where: { miembroId: m[i].id, concepto: concepto as ConceptoCobro } });
            const res = await pagar(cobro.id, i, TARJETAS.aprueba);
            expect(res.body).toMatchObject({ resultado: 'APROBADO' });
        });
    });

    describe('Criterio 4 · Aprobado: cobro Pagado, pago registrado y el Módulo 1 activa o renueva la membresía', () => {
        it('QA-07 · el pago queda registrado con miembro, concepto, monto, fecha, últimos 4 y número de transacción', async () => {
            const cobro = await prisma.cobro.findFirstOrThrow({
                where: { miembroId: m[0].id, concepto: 'MEMBRESIA' },
                include: { intentos: true },
            });
            expect(cobro).toMatchObject({ miembroId: m[0].id, concepto: 'MEMBRESIA', estado: 'PAGADO' });
            expect(cobro.monto.toNumber()).toBe(35.5);
            expect(cobro.pagadoEn).not.toBeNull();
            expect(cobro.intentos).toEqual([
                expect.objectContaining({ resultado: 'APROBADO', ultimos4: '4242', referencia: expect.stringMatching(/^PAY-\d{8}-[A-Z0-9]{6}$/) }),
            ]);
        });

        it('QA-08 · compra: la membresía queda pagada con la cobertura de H2', async () => {
            const membresia = await prisma.membresia.findFirstOrThrow({ where: { miembroId: m[0].id } });
            expect(membresia.estado).toBe('PAGADA');
            expect(membresia.fechaInicio?.toISOString().slice(0, 10)).toBe(hoy);
            expect(membresia.fechaVencimiento?.toISOString().slice(0, 10)).toBe(sumarDias(hoy, 29));
        });

        it('QA-09 · renovación pagada el día del vencimiento (reloj simulado): renueva desde el día siguiente', async () => {
            vi.useFakeTimers({ toFake: ['Date'] });
            vi.setSystemTime(local(sumarDias(hoy, 29), '09:00'));
            try {
                m[3].token = await login(m[3].email);
                const [renovacion] = (await mios(3, 'PENDIENTE')).body;
                expect(renovacion.habilitado).toBe(true);

                const res = await pagar(renovacion.id, 3, TARJETAS.aprueba);
                expect(res.body.resultado).toBe('APROBADO');
                const renovada = await prisma.membresia.findFirstOrThrow({ where: { miembroId: m[3].id, tipoOperacion: 'RENOVACION' } });
                expect(renovada.estado).toBe('PAGADA');
                expect(renovada.fechaInicio?.toISOString().slice(0, 10)).toBe(sumarDias(hoy, 30));
                expect(renovada.fechaVencimiento?.toISOString().slice(0, 10)).toBe(sumarDias(hoy, 59));
            } finally {
                vi.useRealTimers();
                m[3].token = await login(m[3].email);
            }
        });
    });

    describe('Criterio 5 · Comprobante con número, transacción, concepto, subtotal, IVA 13 %, total y fecha', () => {
        it.each([
            ['membresía $35.50', 0, 'MEMBRESIA', 31.42, 4.08, 35.5],
            ['sesión adicional $12.50', 0, 'SESION_ADICIONAL', 11.06, 1.44, 12.5],
        ])('QA-10 · %s', async (_t, i, concepto, subtotal, iva, total) => {
            const cobro = (await mios(i, 'PAGADO')).body.find((c: { concepto: string }) => c.concepto === concepto);
            const res = await http().get(`/api/v1/comprobantes/${cobro.comprobanteNumero}`).set('Authorization', `Bearer ${m[i].token}`);
            const intento = await prisma.intentoPago.findFirstOrThrow({ where: { cobroId: cobro.id, resultado: 'APROBADO' } });
            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({
                numero: expect.stringMatching(/^CMP-\d{6}$/),
                referencia: intento.referencia,
                concepto,
                subtotal,
                iva,
                total,
                emitidoEn: expect.any(String),
                ultimos4: '4242',
            });
        });

        it('QA-11 · tercer monto: set de $50.00 → 44.25 + 5.75 (pagado tras reintentar)', async () => {
            const cobro = await prisma.cobro.findFirstOrThrow({ where: { miembroId: m[1].id } });
            const res = await pagar(cobro.id, 1, TARJETAS.aprueba);
            const comprobante = await http().get(`/api/v1/comprobantes/${res.body.comprobanteNumero}`).set('Authorization', `Bearer ${m[1].token}`);
            expect(comprobante.body).toMatchObject({ concepto: 'MEMBRESIA', subtotal: 44.25, iva: 5.75, total: 50 });
        });
    });

    describe('Criterio 6 · Rechazo o error: sigue Pendiente, sin membresía activa ni comprobante, y se puede reintentar', () => {
        it('QA-12 · tras 0002, 0119 y otra tarjeta, el cobro siguió pendiente hasta el reintento aprobado', async () => {
            const cobro = await prisma.cobro.findFirstOrThrow({ where: { miembroId: m[1].id }, include: { intentos: { orderBy: { creadoEn: 'asc' } } } });
            expect(cobro.intentos.map((i) => [i.resultado, i.ultimos4])).toEqual([
                ['RECHAZADO', '0002'],
                ['ERROR', '0119'],
                ['RECHAZADO', '4444'],
                ['APROBADO', '4242'],
            ]);
            expect(await prisma.comprobante.count({ where: { cobroId: cobro.id } })).toBe(1);
        });

        it('QA-13 · un rechazo no activa la membresía, no emite comprobante y devuelve el mensaje de la pasarela', async () => {
            const { membresiaId, cobroId } = await registrar(2, 'mensual');
            const res = await pagar(cobroId, 2, TARJETAS.rechaza);
            expect(res.body).toEqual({ resultado: 'RECHAZADO', mensaje: 'Tu banco rechazó el pago. Verifica los datos o usa otra tarjeta.' });
            expect((await prisma.cobro.findUniqueOrThrow({ where: { id: cobroId } })).estado).toBe('PENDIENTE');
            expect((await prisma.membresia.findUniqueOrThrow({ where: { id: membresiaId } })).estado).toBe('PENDIENTE_PAGO');
            expect(await prisma.comprobante.count({ where: { cobroId } })).toBe(0);
        });
    });

    describe('Criterio 7 · No se guarda el número completo de la tarjeta ni el código de seguridad', () => {
        it('QA-14 · ninguna columna de texto de la base contiene un número de tarjeta usado ni el CVV', async () => {
            const columnas = await prisma.$queryRaw<{ tabla: string; columna: string }[]>`
                SELECT table_name AS tabla, column_name AS columna FROM information_schema.columns
                WHERE table_schema = 'public' AND data_type IN ('text', 'character varying', 'character')`;
            const hallazgos: string[] = [];
            for (const { tabla, columna } of columnas) {
                for (const numero of Object.values(TARJETAS)) {
                    const [{ total }] = await prisma.$queryRawUnsafe<{ total: bigint }[]>(
                        `SELECT count(*) AS total FROM "${tabla}" WHERE "${columna}" LIKE '%' || $1 || '%' OR "${columna}" = $2`,
                        numero, CVV,
                    );
                    if (Number(total) > 0) hallazgos.push(`${tabla}.${columna}`);
                }
            }
            expect(hallazgos).toEqual([]);
        });

        it('QA-15 · los intentos guardan solo 4 dígitos', async () => {
            const intentos = await prisma.intentoPago.findMany({ where: { cobro: { miembroId: { in: m.map((x) => x.id) } } } });
            expect(intentos.length).toBeGreaterThan(5);
            expect(intentos.every((i) => /^\d{4}$/.test(i.ultimos4))).toBe(true);
        });
    });

    describe('Criterio 8 · Se rechazan las renovaciones no habilitadas, los cobros ajenos y los ya pagados, sin registrar el pago', () => {
        it('QA-17 · cobro de otro miembro → 403 y sin intento', async () => {
            const { cobroId } = await registrar(4, 'mensual');
            const res = await pagar(cobroId, 5, TARJETAS.aprueba);
            expect(res.status).toBe(403);
            expect(await prisma.intentoPago.count({ where: { cobroId } })).toBe(0);
        });

        it('QA-18 · cobro ya pagado → 409 y sin otro intento', async () => {
            const pagado = await prisma.cobro.findFirstOrThrow({ where: { miembroId: m[0].id, concepto: 'MEMBRESIA' } });
            const antes = await prisma.intentoPago.count({ where: { cobroId: pagado.id } });
            const res = await pagar(pagado.id, 0, TARJETAS.aprueba);
            expect(res.status).toBe(409);
            expect(await prisma.intentoPago.count({ where: { cobroId: pagado.id } })).toBe(antes);
        });

        it('QA-19 · 10 intentos simultáneos sobre un mismo cobro: un solo pago y un solo comprobante', async () => {
            const { membresiaId, cobroId } = await registrar(6, 'mensual');
            const respuestas = await Promise.all(Array.from({ length: 10 }, () => pagar(cobroId, 6, TARJETAS.aprueba)));
            expect(respuestas.filter((r) => r.body.resultado === 'APROBADO')).toHaveLength(1);
            expect(respuestas.filter((r) => r.status === 409)).toHaveLength(9);
            expect(await prisma.comprobante.count({ where: { cobroId } })).toBe(1);
            expect(await prisma.intentoPago.count({ where: { cobroId } })).toBe(1);
            expect((await prisma.membresia.findUniqueOrThrow({ where: { id: membresiaId } })).estado).toBe('PAGADA');
        });
    });

    describe('Criterio 7 · Logs (al final, después de todos los pagos)', () => {
        it('QA-20 · la captura funciona (aparece un marcador) y los logs de todos los pagos no contienen la tarjeta ni el CVV', () => {
            new Logger('QA-12.1').log(MARCADOR);
            console.error(MARCADOR);
            expect(salida).toContain(MARCADOR);
            for (const numero of Object.values(TARJETAS)) expect(salida).not.toContain(numero);
            expect(salida).not.toMatch(new RegExp(`\\b${CVV}\\b`));
        });
    });
});
