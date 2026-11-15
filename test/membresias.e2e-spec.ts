/**
 * QA-2.1 · Pruebas del registro de compra o renovación de membresía (H2)
 *
 * Prueba la API de punta a punta contra la base real del docker-compose. Cada
 * bloque `describe` es un criterio de aceptación de H2. Crea sus propios
 * miembros y planes (prefijo [QA-2.1]) y los borra al terminar.
 *
 * Reloj simulado: solo se simula `Date` (vi.useFakeTimers con toFake: Date),
 * así "hoy" es siempre el 16/11/2026 en El Salvador y el pago tardío se
 * prueba adelantando el reloj, sin frenar los temporizadores de la base.
 *
 * Pasarela: el Módulo 5 confirma un pago aprobado llamando a
 * MembresiasService.aplicarPago(); eso es lo que se prueba aquí. El intento
 * con la tarjeta terminada en 0002 contra la pasarela simulada es manual y
 * queda pendiente de H12 (ver docs/qa/H2-pruebas-membresias.md).
 *
 * Requisitos: migraciones aplicadas y `npm run db:seed`.
 * Ejecutar: npm run test:e2e
 */
import { randomInt, randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { MembresiasService } from '@Membresias/services';
import { PrismaService } from '@Prisma/services';
import { TipoPlan } from '@PrismaClient';

const PREFIJO = '[QA-2.1]';
const HOY = '2026-11-16';
/** Instante a una hora local de El Salvador (UTC-6). */
const local = (dia: string, hora = '10:00') => new Date(`${dia}T${hora}:00-06:00`);
const dias = (n: number, desde = HOY) => {
    const d = new Date(`${desde}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
};
const diaDe = (fecha: Date | null) => fecha?.toISOString().slice(0, 10) ?? null;

const CORREOS = {
    RECEPCION: 'recepcion@madlions.com',
    ADMINISTRADOR: 'admin@madlions.com',
    ENTRENADOR: 'entrenador@madlions.com',
    MIEMBRO: 'miembro@madlions.com',
} as const;
type Rol = keyof typeof CORREOS;
const FECHA_INVALIDA = 'La fecha de inicio debe estar entre hoy y los próximos 30 días';
const PENDIENTE = 'El miembro ya tiene una compra o renovación pendiente de pago';

interface MiembroQa {
    id: string;
    usuarioId: string;
    nombre: string;
    apellido: string;
    codigo: string;
    documento: string;
}

describe('QA-2.1 · Registro de compra o renovación de membresía (H2)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let membresias: MembresiasService;
    const token = {} as Record<Rol, string>;
    const corrida = randomUUID().slice(0, 6);
    const base = randomInt(100_000, 899_000);
    const miembros: MiembroQa[] = [];
    const planes = {} as Record<'DAYPASS' | 'MENSUAL' | 'SET' | 'INACTIVO', string>;
    let tiposClase: string[] = [];
    let recepcionId: string;

    const http = () => request(app.getHttpServer());
    const como = (rol: Rol) => ({ Authorization: `Bearer ${token[rol]}` });
    const resumen = (miembroId: string, planId: string, fechaInicio?: string, rol: Rol = 'RECEPCION') =>
        http()
            .get('/api/v1/membresias/resumen')
            .query({ miembroId, planId, ...(fechaInicio ? { fechaInicio } : {}) })
            .set(como(rol));
    const registrar = (miembroId: string, planId: string, fechaInicio?: string, rol: Rol = 'RECEPCION') =>
        http()
            .post('/api/v1/membresias')
            .set(como(rol))
            .send({ miembroId, planId, ...(fechaInicio ? { fechaInicio } : {}) });
    const mensaje = (body: { message: string | string[] }) =>
        Array.isArray(body.message) ? body.message[0] : body.message;
    /** i-ésimo miembro de prueba (cada caso usa el suyo). */
    const m = (i: number) => miembros[i];

    beforeAll(async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(local(HOY));

        const ref = await Test.createTestingModule({ imports: [AppModule] }).compile();
        app = ref.createNestApplication();
        // Igual que main.ts.
        app.setGlobalPrefix('api/v1');
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
        await app.init();
        prisma = app.get(PrismaService);
        membresias = app.get(MembresiasService);

        for (const [rol, email] of Object.entries(CORREOS) as [Rol, string][]) {
            const res = await http().post('/api/v1/auth/login').send({ email, password: 'Demo1234!' });
            if (res.status !== 200) throw new Error(`No se pudo iniciar sesión con ${email}: corre npm run db:seed`);
            token[rol] = (res.body as { accessToken: string }).accessToken;
        }
        recepcionId = (await prisma.user.findUniqueOrThrow({ where: { email: CORREOS.RECEPCION } })).id;
        tiposClase = (await prisma.tipoClase.findMany({ take: 2, orderBy: { nombre: 'asc' } })).map((t) => t.id);

        // 14 miembros propios, uno por caso que necesita empezar sin membresías.
        for (let i = 0; i < 14; i++) {
            const n = base + i;
            const usuario = await prisma.user.create({
                data: {
                    email: `qa21-${corrida}-${i}@test.com`,
                    passwordHash: 'x',
                    nombre: 'Prueba',
                    apellido: `QA21 ${corrida} ${i}`,
                    telefono: String(70_000_000 + n).slice(0, 8),
                },
            });
            const miembro = await prisma.miembro.create({
                data: {
                    usuarioId: usuario.id,
                    documento: `${String(n).padStart(8, '0')}-${i % 10}`,
                    codigoMiembro: `MBR-${String(n).padStart(6, '0')}`,
                },
            });
            miembros.push({
                id: miembro.id,
                usuarioId: usuario.id,
                nombre: usuario.nombre,
                apellido: usuario.apellido,
                codigo: miembro.codigoMiembro,
                documento: miembro.documento,
            });
        }

        const plan = async (clave: keyof typeof planes, tipo: TipoPlan, precio: number, cantidadClases: number | null, activo = true) => {
            const creado = await prisma.plan.create({
                data: {
                    nombre: `${PREFIJO} ${clave} ${corrida}`,
                    tipo,
                    precio,
                    cantidadClases,
                    duracionDias: tipo === TipoPlan.DAYPASS ? 1 : 30,
                    beneficios: `Beneficios ${clave}`,
                    activo,
                    tiposClase: { create: tiposClase.map((tipoClaseId) => ({ tipoClaseId })) },
                },
            });
            planes[clave] = creado.id;
        };
        await plan('DAYPASS', TipoPlan.DAYPASS, 5, null);
        await plan('MENSUAL', TipoPlan.MENSUAL, 35.5, null);
        await plan('SET', TipoPlan.SET_CLASES, 50, 10);
        await plan('INACTIVO', TipoPlan.MENSUAL, 20, null, false);
    });

    afterAll(async () => {
        const ids = miembros.map((x) => x.id);
        await prisma.cobro.deleteMany({ where: { miembroId: { in: ids } } });
        // Primero las renovaciones (apuntan a la membresía anterior).
        await prisma.membresia.deleteMany({ where: { miembroId: { in: ids }, membresiaAnteriorId: { not: null } } });
        await prisma.membresia.deleteMany({ where: { miembroId: { in: ids } } });
        await prisma.plan.deleteMany({ where: { nombre: { startsWith: PREFIJO } } });
        await prisma.miembro.deleteMany({ where: { id: { in: ids } } });
        await prisma.user.deleteMany({ where: { id: { in: miembros.map((x) => x.usuarioId) } } });
        await app.close();
        vi.useRealTimers();
    });

    describe('Criterio 1 · Búsqueda de miembros por nombre, documento o código', () => {
        it('QA-01 · por nombre: hasta 20 coincidencias con nombre, código, documento y estado', async () => {
            const res = await http().get('/api/v1/miembros/buscar').query({ q: `qa21 ${corrida}` }).set(como('RECEPCION'));
            expect(res.status).toBe(200);
            const lista = res.body as Record<string, unknown>[];
            expect(lista).toHaveLength(14);
            expect(Object.keys(lista[0]).sort()).toEqual(
                ['apellido', 'codigo', 'documento', 'estadoMembresia', 'fechaVencimiento', 'id', 'nombre'].sort(),
            );
            expect(lista[0].estadoMembresia).toBe('SIN_MEMBRESIA');
        });

        it('QA-02 · por documento y por código exactos', async () => {
            const porDocumento = await http().get('/api/v1/miembros/buscar').query({ q: m(0).documento }).set(como('RECEPCION'));
            const porCodigo = await http().get('/api/v1/miembros/buscar').query({ q: m(0).codigo.toLowerCase() }).set(como('RECEPCION'));
            expect((porDocumento.body as { id: string }[]).map((x) => x.id)).toEqual([m(0).id]);
            expect((porCodigo.body as { id: string }[]).map((x) => x.id)).toEqual([m(0).id]);
        });
    });

    describe('Criterio 2 · Fecha de inicio y resumen', () => {
        it('QA-03 · el resumen muestra miembro, plan, precio, beneficios, duración, operación, inicio y vencimiento', async () => {
            const res = await resumen(m(0).id, planes.MENSUAL);
            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({
                miembro: { id: m(0).id, codigo: m(0).codigo },
                plan: { id: planes.MENSUAL, tipo: 'MENSUAL' },
                precio: 35.5,
                beneficios: 'Beneficios MENSUAL',
                duracionDias: 30,
                tipoOperacion: 'COMPRA',
                fechaInicio: HOY,
                fechaVencimiento: dias(29),
                fechaInicioFija: false,
            });
            expect(await prisma.membresia.count({ where: { miembroId: m(0).id } })).toBe(0);
        });

        it.each([
            ['DAYPASS', 0, 1, 0],
            ['DAYPASS', 10, 2, 0],
            ['MENSUAL', 0, 3, 29],
            ['MENSUAL', 10, 4, 29],
            ['SET', 0, 5, 29],
            ['SET', 10, 6, 29],
        ] as const)('QA-04 · compra %s con inicio a hoy + %s días', async (clave, desplazamiento, i, duracion) => {
            const inicio = dias(desplazamiento);
            const previo = await resumen(m(i).id, planes[clave], inicio);
            expect(previo.body).toMatchObject({ tipoOperacion: 'COMPRA', fechaInicio: inicio, fechaVencimiento: dias(duracion, inicio) });

            const res = await registrar(m(i).id, planes[clave], inicio);
            expect(res.status).toBe(201);
            expect(res.body).toMatchObject({ tipoOperacion: 'COMPRA', estado: 'PENDIENTE_PAGO' });
        });

        it.each([
            ['ayer', -1],
            ['a 31 días', 31],
        ])('QA-05 · fecha de inicio %s: rechazada', async (_caso, desplazamiento) => {
            const previo = await resumen(m(7).id, planes.MENSUAL, dias(desplazamiento));
            const res = await registrar(m(7).id, planes.MENSUAL, dias(desplazamiento));
            expect([previo.status, res.status]).toEqual([400, 400]);
            expect(mensaje(res.body)).toBe(FECHA_INVALIDA);
            expect(await prisma.membresia.count({ where: { miembroId: m(7).id } })).toBe(0);
        });

        it('QA-06 · el plan inactivo y el miembro o plan inexistentes se rechazan', async () => {
            expect((await resumen(m(7).id, planes.INACTIVO)).status).toBe(409);
            expect((await resumen(randomUUID(), planes.MENSUAL)).status).toBe(404);
            expect((await resumen(m(7).id, randomUUID())).status).toBe(404);
        });
    });

    describe('Criterio 3 · Compra o renovación', () => {
        it('QA-07 · renovación de una membresía vigente: inicia el día siguiente al vencimiento', async () => {
            // m(8) compra y paga hoy un Mensual: vigente hasta hoy + 29.
            const compra = await registrar(m(8).id, planes.MENSUAL);
            await membresias.aplicarPago(compra.body.id, `QA21-${corrida}-R1`, local(HOY));

            const previo = await resumen(m(8).id, planes.MENSUAL, dias(5));
            expect(previo.body).toMatchObject({
                tipoOperacion: 'RENOVACION',
                fechaInicio: dias(30),
                fechaVencimiento: dias(59),
                fechaInicioFija: true,
            });

            const res = await registrar(m(8).id, planes.MENSUAL, dias(5));
            expect(res.status).toBe(201);
            const guardada = await prisma.membresia.findUniqueOrThrow({ where: { id: res.body.id } });
            expect(guardada).toMatchObject({ tipoOperacion: 'RENOVACION', membresiaAnteriorId: compra.body.id });
            expect(diaDe(guardada.fechaInicioSolicitada)).toBe(dias(30));
        });

        it('QA-08 · renovación de una membresía vencida del mismo plan: usa la fecha elegida', async () => {
            await prisma.membresia.create({
                data: {
                    miembroId: m(9).id, planId: planes.SET, nombrePlan: 'Set', tipoPlan: TipoPlan.SET_CLASES, precio: 50,
                    cantidadClases: 10, tipoOperacion: 'COMPRA', estado: 'PAGADA', fechaInicioSolicitada: new Date(`${dias(-60)}T00:00:00Z`),
                    fechaInicio: new Date(`${dias(-60)}T00:00:00Z`), fechaVencimiento: new Date(`${dias(-31)}T00:00:00Z`), registradaPorId: recepcionId,
                },
            });
            const res = await resumen(m(9).id, planes.SET, dias(3));
            expect(res.body).toMatchObject({ tipoOperacion: 'RENOVACION', fechaInicio: dias(3), fechaInicioFija: false });
        });

        it('QA-09 · con otro plan, o con un Daypass aunque tenga otro Daypass, es compra', async () => {
            expect((await resumen(m(9).id, planes.MENSUAL)).body.tipoOperacion).toBe('COMPRA');
            await membresias.aplicarPago((await prisma.membresia.findFirstOrThrow({ where: { miembroId: m(1).id } })).id, `QA21-${corrida}-D1`, local(HOY));
            const daypass = await resumen(m(1).id, planes.DAYPASS);
            expect(daypass.body).toMatchObject({ tipoOperacion: 'COMPRA', fechaInicioFija: false });
        });
    });

    describe('Criterio 4 · Se guarda pendiente de pago con las condiciones del plan y el cobro', () => {
        it('QA-10 · membresía PENDIENTE_PAGO con la copia del plan, la fecha elegida y el usuario de recepción', async () => {
            const guardada = await prisma.membresia.findFirstOrThrow({
                where: { miembroId: m(6).id },
                include: { tiposClase: true },
            });
            expect(guardada).toMatchObject({
                planId: planes.SET,
                nombrePlan: `${PREFIJO} SET ${corrida}`,
                tipoPlan: 'SET_CLASES',
                cantidadClases: 10,
                tipoOperacion: 'COMPRA',
                estado: 'PENDIENTE_PAGO',
                registradaPorId: recepcionId,
                fechaInicio: null,
                fechaVencimiento: null,
            });
            expect(guardada.precio.toNumber()).toBe(50);
            expect(diaDe(guardada.fechaInicioSolicitada)).toBe(dias(10));
            expect(guardada.tiposClase.map((t) => t.tipoClaseId).sort()).toEqual([...tiposClase].sort());
        });

        it('QA-11 · el Módulo 5 genera un cobro PENDIENTE por el precio, ligado a la membresía', async () => {
            const guardada = await prisma.membresia.findFirstOrThrow({ where: { miembroId: m(6).id } });
            const cobro = await prisma.cobro.findFirstOrThrow({ where: { referenciaId: guardada.id } });
            expect(cobro).toMatchObject({ miembroId: m(6).id, concepto: 'MEMBRESIA', referenciaTipo: 'MEMBRESIA', estado: 'PENDIENTE' });
            expect(cobro.monto.toNumber()).toBe(50);
        });

        it('QA-12 · editar el plan después no cambia la membresía ya registrada', async () => {
            const editar = await http()
                .patch(`/api/v1/planes/${planes.SET}`)
                .set(como('ADMINISTRADOR'))
                .send({ precio: 99, beneficios: 'Cambiados' });
            expect(editar.status).toBe(200);
            const guardada = await prisma.membresia.findFirstOrThrow({ where: { miembroId: m(6).id } });
            expect(guardada.precio.toNumber()).toBe(50);
        });
    });

    describe('Criterio 5 · Pago aprobado: pasa a Pagada y la cobertura empieza en la fecha correcta', () => {
        it('QA-13 · pago antes de la fecha elegida: la cobertura empieza en la fecha elegida', async () => {
            const pendiente = await prisma.membresia.findFirstOrThrow({ where: { miembroId: m(4).id } });
            const r = await membresias.aplicarPago(pendiente.id, `QA21-${corrida}-P1`, local(HOY));
            expect(r.aplicado).toBe(true);
            expect(r.membresia.estado).toBe('PAGADA');
            expect([diaDe(r.membresia.fechaInicio), diaDe(r.membresia.fechaVencimiento)]).toEqual([dias(10), dias(39)]);
        });

        it('QA-14 · pago aprobado después de la fecha elegida: inicia el día del pago (reloj adelantado 12 días)', async () => {
            const pendiente = await prisma.membresia.findFirstOrThrow({ where: { miembroId: m(3).id } });
            vi.setSystemTime(local(dias(12), '18:30'));
            try {
                const r = await membresias.aplicarPago(pendiente.id, `QA21-${corrida}-P2`, new Date());
                expect([diaDe(r.membresia.fechaInicio), diaDe(r.membresia.fechaVencimiento)]).toEqual([dias(12), dias(41)]);
                await expect(membresias.obtenerEstado(m(3).id)).resolves.toMatchObject({ estado: 'VIGENTE', diasRestantes: 29 });
            } finally {
                vi.setSystemTime(local(HOY));
            }
        });

        it('QA-15 · en Set de clases mensual recibe los créditos del plan', async () => {
            const pendiente = await prisma.membresia.findFirstOrThrow({ where: { miembroId: m(5).id } });
            await membresias.aplicarPago(pendiente.id, `QA21-${corrida}-P3`, local(HOY));
            await expect(membresias.obtenerEstado(m(5).id)).resolves.toMatchObject({
                estado: 'VIGENTE',
                creditosTotales: 10,
                creditosDisponibles: 10,
            });
        });

        it('QA-16 · renovación de una vigente pagada antes de vencer: continúa sin huecos', async () => {
            const renovacion = await prisma.membresia.findFirstOrThrow({ where: { miembroId: m(8).id, tipoOperacion: 'RENOVACION' } });
            const r = await membresias.aplicarPago(renovacion.id, `QA21-${corrida}-P4`, local(dias(20)));
            expect([diaDe(r.membresia.fechaInicio), diaDe(r.membresia.fechaVencimiento)]).toEqual([dias(30), dias(59)]);
            await expect(membresias.obtenerEstado(m(8).id)).resolves.toMatchObject({
                estado: 'VIGENTE',
                fechaVencimiento: dias(29),
                renovacion: { estado: 'POR_INICIAR', fechaInicio: dias(30) },
            });
        });
    });

    describe('Criterio 6 · Pago rechazado: sigue Pendiente de pago, sin cobertura', () => {
        it('QA-17 · si el Módulo 5 informa un rechazo (no llama a aplicarPago), nada cambia', async () => {
            const pendiente = await prisma.membresia.findFirstOrThrow({ where: { miembroId: m(2).id } });
            expect(pendiente).toMatchObject({ estado: 'PENDIENTE_PAGO', fechaInicio: null, fechaVencimiento: null, pagoAplicadoRef: null });
            expect(await prisma.cobro.findFirstOrThrow({ where: { referenciaId: pendiente.id } })).toMatchObject({ estado: 'PENDIENTE' });
            await expect(membresias.obtenerEstado(m(2).id)).resolves.toMatchObject({ estado: 'PENDIENTE_PAGO', fechaVencimiento: null });
        });
    });

    describe('Criterio 7 · Operación pendiente duplicada y fechas fuera de rango', () => {
        it('QA-18 · una segunda operación con otra pendiente se rechaza con el mensaje del criterio', async () => {
            const resumenDuplicado = await resumen(m(2).id, planes.MENSUAL);
            const res = await registrar(m(2).id, planes.MENSUAL);
            expect([resumenDuplicado.status, res.status]).toEqual([409, 409]);
            expect(res.body.message).toBe(PENDIENTE);
            expect(await prisma.membresia.count({ where: { miembroId: m(2).id } })).toBe(1);
        });

        it('QA-19 · cuatro registros simultáneos del mismo miembro: queda uno solo', async () => {
            const respuestas = await Promise.all([1, 2, 3, 4].map(() => registrar(m(10).id, planes.MENSUAL)));
            expect(respuestas.map((r) => r.status).sort((a, b) => a - b)).toEqual([201, 409, 409, 409]);
            expect(await prisma.membresia.count({ where: { miembroId: m(10).id } })).toBe(1);
            expect(await prisma.cobro.count({ where: { miembroId: m(10).id } })).toBe(1);
        });
    });

    describe('Criterio 8 · La misma confirmación de pago dos veces se aplica una sola vez', () => {
        it('QA-20 · la segunda llamada con la misma referencia no hace nada', async () => {
            const pendiente = await prisma.membresia.findFirstOrThrow({ where: { miembroId: m(10).id } });
            const primera = await membresias.aplicarPago(pendiente.id, `QA21-${corrida}-DOBLE`, local(HOY));
            const segunda = await membresias.aplicarPago(pendiente.id, `QA21-${corrida}-DOBLE`, local(dias(5)));
            expect([primera.aplicado, segunda.aplicado]).toEqual([true, false]);
            expect(diaDe(segunda.membresia.fechaInicio)).toBe(HOY);
        });

        it('QA-21 · tres confirmaciones simultáneas: se aplica una sola', async () => {
            const res = await registrar(m(11).id, planes.DAYPASS);
            const resultados = await Promise.all(
                [1, 2, 3].map(() => membresias.aplicarPago(res.body.id, `QA21-${corrida}-SIM`, local(HOY))),
            );
            expect(resultados.filter((r) => r.aplicado)).toHaveLength(1);
        });

        it('QA-22 · otra referencia sobre una membresía ya pagada se rechaza', async () => {
            const pagada = await prisma.membresia.findFirstOrThrow({ where: { miembroId: m(10).id } });
            await expect(membresias.aplicarPago(pagada.id, `QA21-${corrida}-OTRA`, local(HOY))).rejects.toMatchObject({ status: 409 });
        });
    });

    describe('Criterio 9 · Solo RECEPCION registra; los demás reciben acceso denegado', () => {
        it('QA-23 · sin sesión responde 401', async () => {
            expect((await http().post('/api/v1/membresias').send({})).status).toBe(401);
        });

        it.each(['MIEMBRO', 'ENTRENADOR', 'ADMINISTRADOR'] as const)('QA-24 · %s recibe 403 al ver el resumen y al registrar', async (rol) => {
            const [previo, res] = await Promise.all([
                resumen(m(12).id, planes.MENSUAL, undefined, rol),
                registrar(m(12).id, planes.MENSUAL, undefined, rol),
            ]);
            expect([previo.status, res.status]).toEqual([403, 403]);
            expect(res.body.message).toBe('No tienes permiso para realizar esta acción.');
            expect(await prisma.membresia.count({ where: { miembroId: m(12).id } })).toBe(0);
        });

        it('QA-25 · MIEMBRO no puede buscar miembros; ENTRENADOR busca sin documento ni estado', async () => {
            expect((await http().get('/api/v1/miembros/buscar').query({ q: m(0).codigo }).set(como('MIEMBRO'))).status).toBe(403);
            const entrenador = await http().get('/api/v1/miembros/buscar').query({ q: m(0).codigo }).set(como('ENTRENADOR'));
            expect(Object.keys(entrenador.body[0]).sort()).toEqual(['apellido', 'codigo', 'id', 'nombre']);
        });

        it('QA-26 · RECEPCION sí registra', async () => {
            expect((await registrar(m(13).id, planes.MENSUAL)).status).toBe(201);
        });
    });
});
