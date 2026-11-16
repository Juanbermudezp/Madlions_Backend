/**
 * H12 · Pago de cobros con la pasarela simulada (BE-12.3).
 *
 * Contra la base real del docker-compose. Crea sus propios miembros (prefijo
 * qa12-) y recepción les registra compras por la API, así los cobros son los
 * reales del Módulo 1. Al terminar borra todo lo que creó.
 *
 * La espera de la pasarela se reduce a 300 ms en esta prueba (los 2 segundos
 * se prueban en pasarela-simulada.service.spec.ts).
 *
 * Requisitos: migraciones aplicadas y `npm run db:seed`.
 */
import { randomInt, randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { ESPERA_PASARELA_MS } from '@Cobros/services';
import { hoyLocal, sumarDias } from '@Common/fechas';
import { PrismaService } from '@Prisma/services';
import { TipoPlan } from '@PrismaClient';

const TARJETA = { titular: 'Prueba QA', vencimiento: '12/30', cvv: '123' };
const APRUEBA = '4242424242424242';
const RECHAZA = '4000000000000002';
const ERROR = '4000000000000119';

describe('H12 · POST /cobros/:id/pagar', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    const corrida = randomUUID().slice(0, 6);
    const base = randomInt(100_000, 899_000);
    const miembros: { id: string; usuarioId: string; token: string }[] = [];
    let tokenRecepcion: string;
    let planId: string;
    const hoy = hoyLocal();

    const http = () => request(app.getHttpServer());
    const pagar = (cobroId: string, token: string, numero: string, extra: Record<string, unknown> = {}) =>
        http().post(`/api/v1/cobros/${cobroId}/pagar`).set('Authorization', `Bearer ${token}`).send({ ...TARJETA, numero, ...extra });
    /** Recepción registra una compra para el miembro i y devuelve su cobro. */
    async function compra(i: number) {
        const res = await http()
            .post('/api/v1/membresias')
            .set('Authorization', `Bearer ${tokenRecepcion}`)
            .send({ miembroId: miembros[i].id, planId });
        expect(res.status).toBe(201);
        return { membresiaId: res.body.id as string, cobroId: res.body.cobroId as string };
    }

    beforeAll(async () => {
        const ref = await Test.createTestingModule({ imports: [AppModule] })
            .overrideProvider(ESPERA_PASARELA_MS)
            .useValue(300)
            .compile();
        app = ref.createNestApplication();
        app.setGlobalPrefix('api/v1');
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
        await app.init();
        prisma = app.get(PrismaService);

        const login = async (email: string) => {
            const res = await http().post('/api/v1/auth/login').send({ email, password: 'Demo1234!' });
            if (res.status !== 200) throw new Error(`No se pudo iniciar sesión con ${email}: corre npm run db:seed`);
            return (res.body as { accessToken: string }).accessToken;
        };
        tokenRecepcion = await login('recepcion@madlions.com');
        const { passwordHash } = await prisma.user.findUniqueOrThrow({ where: { email: 'miembro@madlions.com' } });

        for (let i = 0; i < 6; i++) {
            const n = base + i;
            const usuario = await prisma.user.create({
                data: {
                    email: `qa12-${corrida}-${i}@test.com`, passwordHash, nombre: 'Prueba',
                    apellido: `QA12 ${corrida} ${i}`, telefono: String(73_000_000 + n).slice(0, 8),
                },
            });
            const miembro = await prisma.miembro.create({
                data: { usuarioId: usuario.id, documento: `${String(n).padStart(8, '0')}-${i}`, codigoMiembro: `MBR-${String(n).padStart(6, '0')}` },
            });
            miembros.push({ id: miembro.id, usuarioId: usuario.id, token: await login(usuario.email) });
        }
        planId = (
            await prisma.plan.create({
                data: { nombre: `[QA-H12] Mensual ${corrida}`, tipo: TipoPlan.MENSUAL, precio: 35.5, duracionDias: 30, beneficios: 'Prueba H12' },
            })
        ).id;
    });

    afterAll(async () => {
        const ids = miembros.map((m) => m.id);
        const cobros = await prisma.cobro.findMany({ where: { miembroId: { in: ids } }, select: { id: true } });
        await prisma.comprobante.deleteMany({ where: { cobroId: { in: cobros.map((c) => c.id) } } });
        await prisma.intentoPago.deleteMany({ where: { cobroId: { in: cobros.map((c) => c.id) } } });
        await prisma.cobro.deleteMany({ where: { miembroId: { in: ids } } });
        await prisma.membresia.deleteMany({ where: { miembroId: { in: ids }, membresiaAnteriorId: { not: null } } });
        await prisma.membresia.deleteMany({ where: { miembroId: { in: ids } } });
        await prisma.plan.deleteMany({ where: { id: planId } });
        await prisma.miembro.deleteMany({ where: { id: { in: ids } } });
        await prisma.user.deleteMany({ where: { id: { in: miembros.map((m) => m.usuarioId) } } });
        await app.close();
    });

    it('4242: aprueba, el cobro pasa a PAGADO, emite el comprobante y activa la membresía', async () => {
        const { membresiaId, cobroId } = await compra(0);

        const res = await pagar(cobroId, miembros[0].token, APRUEBA);

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            resultado: 'APROBADO',
            referencia: expect.stringMatching(/^PAY-\d{8}-[A-Z0-9]{6}$/),
            comprobanteNumero: expect.stringMatching(/^CMP-\d{6}$/),
        });
        const cobro = await prisma.cobro.findUniqueOrThrow({ where: { id: cobroId }, include: { comprobante: true, intentos: true } });
        expect(cobro.estado).toBe('PAGADO');
        expect(cobro.pagadoEn).not.toBeNull();
        expect(cobro.comprobante).toMatchObject({ numero: res.body.comprobanteNumero });
        expect([cobro.comprobante!.subtotal.toNumber(), cobro.comprobante!.iva.toNumber(), cobro.comprobante!.total.toNumber()]).toEqual([31.42, 4.08, 35.5]);
        expect(cobro.intentos).toEqual([expect.objectContaining({ resultado: 'APROBADO', ultimos4: '4242', referencia: res.body.referencia })]);

        const membresia = await prisma.membresia.findUniqueOrThrow({ where: { id: membresiaId } });
        expect(membresia).toMatchObject({ estado: 'PAGADA', pagoAplicadoRef: res.body.referencia });
        expect(membresia.fechaInicio?.toISOString().slice(0, 10)).toBe(hoy);
        expect(membresia.fechaVencimiento?.toISOString().slice(0, 10)).toBe(sumarDias(hoy, 29));
    }, 15_000);

    it.each([
        ['0002', RECHAZA, 'RECHAZADO'],
        ['0119', ERROR, 'ERROR'],
    ])('%s: %s, el cobro sigue PENDIENTE, sin comprobante ni membresía activa; se puede reintentar', async (_t, numero, resultado) => {
        const { membresiaId, cobroId } = await compra(resultado === 'RECHAZADO' ? 1 : 2);

        const res = await pagar(cobroId, miembros[resultado === 'RECHAZADO' ? 1 : 2].token, numero);

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ resultado, mensaje: expect.any(String) });
        const cobro = await prisma.cobro.findUniqueOrThrow({ where: { id: cobroId }, include: { comprobante: true, intentos: true } });
        expect(cobro).toMatchObject({ estado: 'PENDIENTE', pagadoEn: null, comprobante: null });
        expect(cobro.intentos).toEqual([expect.objectContaining({ resultado, ultimos4: numero.slice(-4) })]);
        expect((await prisma.membresia.findUniqueOrThrow({ where: { id: membresiaId } })).estado).toBe('PENDIENTE_PAGO');

        // Reintento con una tarjeta que aprueba.
        const reintento = await pagar(cobroId, miembros[resultado === 'RECHAZADO' ? 1 : 2].token, APRUEBA);
        expect(reintento.body.resultado).toBe('APROBADO');
    }, 15_000);

    it('10 intentos simultáneos sobre un mismo cobro: una sola confirmación', async () => {
        const { membresiaId, cobroId } = await compra(3);

        const respuestas = await Promise.all(Array.from({ length: 10 }, () => pagar(cobroId, miembros[3].token, APRUEBA)));

        const aprobados = respuestas.filter((r) => r.status === 200 && r.body.resultado === 'APROBADO');
        expect(aprobados).toHaveLength(1);
        expect(respuestas.filter((r) => r.status === 409)).toHaveLength(9);
        expect(await prisma.comprobante.count({ where: { cobroId } })).toBe(1);
        expect(await prisma.intentoPago.count({ where: { cobroId, resultado: 'APROBADO' } })).toBe(1);
        const membresia = await prisma.membresia.findUniqueOrThrow({ where: { id: membresiaId } });
        expect(membresia.pagoAplicadoRef).toBe(aprobados[0].body.referencia);
    }, 20_000);

    it('cobro ya pagado → 409, sin registrar otro intento', async () => {
        const pagado = await prisma.cobro.findFirstOrThrow({ where: { miembroId: miembros[0].id, estado: 'PAGADO' } });
        const antes = await prisma.intentoPago.count({ where: { cobroId: pagado.id } });

        const res = await pagar(pagado.id, miembros[0].token, APRUEBA);

        expect(res.status).toBe(409);
        expect(res.body.message).toBe('El cobro ya fue pagado.');
        expect(await prisma.intentoPago.count({ where: { cobroId: pagado.id } })).toBe(antes);
    });

    it('renovación no habilitada → 409 "No habilitado: podrás pagar desde el …", sin intento', async () => {
        // El miembro 0 ya tiene la compra pagada y vigente: recepción registra la renovación.
        const res = await http()
            .post('/api/v1/membresias')
            .set('Authorization', `Bearer ${tokenRecepcion}`)
            .send({ miembroId: miembros[0].id, planId });
        expect(res.body.tipoOperacion).toBe('RENOVACION');

        const pago = await pagar(res.body.cobroId, miembros[0].token, APRUEBA);

        const desde = sumarDias(hoy, 29).split('-').reverse().join('/');
        expect(pago.status).toBe(409);
        expect(pago.body.message).toBe(`No habilitado: podrás pagar desde el ${desde}`);
        expect(await prisma.intentoPago.count({ where: { cobroId: res.body.cobroId } })).toBe(0);
    });

    it('cobro de otro miembro → 403 y no se registra el pago', async () => {
        const { cobroId } = await compra(4);
        const res = await pagar(cobroId, miembros[5].token, APRUEBA);
        expect(res.status).toBe(403);
        expect(await prisma.intentoPago.count({ where: { cobroId } })).toBe(0);
        expect((await prisma.cobro.findUniqueOrThrow({ where: { id: cobroId } })).estado).toBe('PENDIENTE');
    });

    it('400 con datos de tarjeta inválidos, 404 si el cobro no existe, 401 sin sesión y 403 para otros roles', async () => {
        const cobro = await prisma.cobro.findFirstOrThrow({ where: { miembroId: miembros[4].id } });
        const invalida = await pagar(cobro.id, miembros[4].token, '4242424242424241');
        expect(invalida.status).toBe(400);
        expect(JSON.stringify(invalida.body)).not.toContain('4242424242424241');
        expect((await pagar(cobro.id, miembros[4].token, APRUEBA, { cvv: '1' })).status).toBe(400);
        expect((await pagar(randomUUID(), miembros[4].token, APRUEBA)).status).toBe(404);
        expect((await http().post(`/api/v1/cobros/${cobro.id}/pagar`).send({ ...TARJETA, numero: APRUEBA })).status).toBe(401);
        expect((await pagar(cobro.id, tokenRecepcion, APRUEBA)).status).toBe(403);
        expect(await prisma.intentoPago.count({ where: { cobroId: cobro.id } })).toBe(0);
    });

    it('ninguna tabla guarda el número completo de la tarjeta ni el código de seguridad', async () => {
        const columnas = await prisma.$queryRaw<{ tabla: string; columna: string }[]>`
            SELECT table_name AS tabla, column_name AS columna FROM information_schema.columns
            WHERE table_schema = 'public' AND data_type IN ('text', 'character varying', 'character')`;
        for (const { tabla, columna } of columnas) {
            const [{ total }] = await prisma.$queryRawUnsafe<{ total: bigint }[]>(
                `SELECT count(*) AS total FROM "${tabla}" WHERE "${columna}" IN ($1, $2, $3) OR "${columna}" LIKE '%' || $1 || '%'`,
                APRUEBA, RECHAZA, ERROR,
            );
            expect({ tabla, columna, total: Number(total) }).toEqual({ tabla, columna, total: 0 });
        }
    });
});
