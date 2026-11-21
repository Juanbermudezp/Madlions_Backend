/**
 * QA-10.1 · Criterios de H10 (registro de ingreso y salida).
 *
 * Contra la base real del docker-compose. Crea sus propios miembros
 * (prefijo qa10-) y un segundo usuario de recepción, y los borra al terminar.
 *
 * Ojo: el caso del cierre automático cierra TODOS los ingresos DENTRO de hoy
 * en la base local (es lo que hace la tarea de las 23:59).
 *
 * Requisitos: migraciones aplicadas y `npm run db:seed`.
 */
import { randomInt, randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { CierreAutomaticoService } from '@Accesos/services';
import { aFechaLocal, hoyLocal } from '@Common/fechas';
import { PrismaService } from '@Prisma/services';
import { EstadoAcceso, Rol } from '@PrismaClient';

const MENSAJES = {
    yaDentro: 'El miembro ya está dentro del gimnasio',
    sinIngreso: 'El miembro no tiene un ingreso abierto',
    denegado: 'Acceso denegado',
};

const MOTIVO_EXCEPCION = 'Prueba QA-10.1 sin membresía';

interface MiembroPrueba {
    id: string;
    codigo: string;
    documento: string;
    nombre: string;
}

describe('QA-10.1 · Registro de ingreso y salida (H10)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    const corrida = randomUUID().slice(0, 6);
    let siguiente = randomInt(100_000, 899_000);
    const hoy = hoyLocal();
    const usuarios: string[] = [];
    const miembros: string[] = [];
    let passwordHash: string;
    let recepcion1: { id: string; token: string };
    let recepcion2: { id: string; token: string };
    let tokenMiembro: string;
    let tokenEntrenador: string;

    const http = () => request(app.getHttpServer());
    const ingreso = (token: string, miembroId: string) =>
        http()
            .post('/api/v1/accesos/ingreso')
            .set('Authorization', `Bearer ${token}`)
            .send({ miembroId, motivoExcepcion: MOTIVO_EXCEPCION });
    const salida = (token: string, registroId: string) =>
        http().post(`/api/v1/accesos/${registroId}/salida`).set('Authorization', `Bearer ${token}`);
    const listaHoy = (token: string) =>
        http().get('/api/v1/accesos/hoy').set('Authorization', `Bearer ${token}`);

    async function login(email: string): Promise<string> {
        const res = await http().post('/api/v1/auth/login').send({ email, password: 'Demo1234!' });
        if (res.status !== 200) throw new Error(`No se pudo iniciar sesión con ${email}: corre npm run db:seed`);
        return (res.body as { accessToken: string }).accessToken;
    }

    async function crearMiembro(): Promise<MiembroPrueba> {
        const n = siguiente++;
        const apellido = `QA10 ${corrida} ${n}`;
        const usuario = await prisma.user.create({
            data: { email: `qa10-${corrida}-${n}@test.com`, passwordHash, nombre: 'Prueba', apellido, telefono: String(76_000_000 + n).slice(0, 8) },
        });
        usuarios.push(usuario.id);
        const documento = `${String(n).padStart(8, '0')}-${n % 10}`;
        const codigo = `MBR-${String(n).padStart(6, '0')}`;
        const miembro = await prisma.miembro.create({ data: { usuarioId: usuario.id, documento, codigoMiembro: codigo } });
        miembros.push(miembro.id);
        return { id: miembro.id, codigo, documento, nombre: `Prueba ${apellido}` };
    }

    beforeAll(async () => {
        const ref = await Test.createTestingModule({ imports: [AppModule] }).compile();
        app = ref.createNestApplication();
        app.setGlobalPrefix('api/v1');
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
        await app.init();
        prisma = app.get(PrismaService);

        passwordHash = (await prisma.user.findUniqueOrThrow({ where: { email: 'recepcion@madlions.com' } })).passwordHash;
        recepcion1 = {
            id: (await prisma.user.findUniqueOrThrow({ where: { email: 'recepcion@madlions.com' } })).id,
            token: await login('recepcion@madlions.com'),
        };

        // Segundo usuario de recepción, para los criterios 3 y 4.
        const otra = await prisma.user.create({
            data: {
                email: `qa10-rec-${corrida}@test.com`, passwordHash, nombre: 'Recepción',
                apellido: `QA10 ${corrida}`, telefono: '76999999', rol: Rol.RECEPCION,
            },
        });
        usuarios.push(otra.id);
        recepcion2 = { id: otra.id, token: await login(otra.email) };

        tokenMiembro = await login('miembro@madlions.com');
        tokenEntrenador = await login('entrenador@madlions.com');
    }, 60_000);

    afterAll(async () => {
        vi.useRealTimers();
        await prisma.registroAcceso.deleteMany({ where: { miembroId: { in: miembros } } });
        await prisma.miembro.deleteMany({ where: { id: { in: miembros } } });
        await prisma.user.deleteMany({ where: { id: { in: usuarios } } });
        await app.close();
    });

    it('C1 · recepción busca por código y por documento y ve el estado de la membresía', async () => {
        const miembro = await crearMiembro();

        for (const q of [miembro.codigo, miembro.documento]) {
            const res = await http()
                .get(`/api/v1/miembros/buscar?q=${encodeURIComponent(q)}`)
                .set('Authorization', `Bearer ${recepcion1.token}`);
            expect(res.status).toBe(200);
            expect(res.body).toContainEqual(
                expect.objectContaining({ id: miembro.id, codigo: miembro.codigo, estadoMembresia: 'SIN_MEMBRESIA' }),
            );
        }
    }, 20_000);

    it('C2 · registrar ingreso deja un registro DENTRO con miembro, fecha, hora y usuario de recepción', async () => {
        const miembro = await crearMiembro();
        const antes = Date.now();

        const res = await ingreso(recepcion1.token, miembro.id);

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({
            estado: 'DENTRO',
            estadoMembresia: 'SIN_MEMBRESIA',
            miembro: { id: miembro.id, nombre: miembro.nombre, codigo: miembro.codigo },
        });
        const registro = await prisma.registroAcceso.findUniqueOrThrow({ where: { id: (res.body as { id: string }).id } });
        expect(registro).toMatchObject({ estado: EstadoAcceso.DENTRO, registradoPorId: recepcion1.id, salidaEn: null });
        expect(registro.ingresoEn.getTime()).toBeGreaterThanOrEqual(antes - 1000);
        expect(registro.ingresoEn.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    }, 20_000);

    it('C3 · registrar salida pasa el mismo registro a SALIO con la hora y el usuario que la registró', async () => {
        const miembro = await crearMiembro();
        const { id } = (await ingreso(recepcion1.token, miembro.id)).body as { id: string };

        const res = await salida(recepcion2.token, id);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ id, estado: 'SALIO', salidaEn: expect.any(String) as string });
        const registro = await prisma.registroAcceso.findUniqueOrThrow({ where: { id } });
        expect(registro).toMatchObject({ estado: EstadoAcceso.SALIO, salidaRegistradaPorId: recepcion2.id, registradoPorId: recepcion1.id });
        expect(await prisma.registroAcceso.count({ where: { miembroId: miembro.id } })).toBe(1);
    }, 20_000);

    it('C4 · lo que registra un usuario de recepción aparece en la consulta del otro', async () => {
        const miembro = await crearMiembro();
        const { id } = (await ingreso(recepcion2.token, miembro.id)).body as { id: string };

        const res = await listaHoy(recepcion1.token);

        expect(res.status).toBe(200);
        expect(res.body).toContainEqual(expect.objectContaining({ id, estado: 'DENTRO' }));
    }, 20_000);

    it('C5 · la lista del día trae nombre, código, ingreso, salida y estado, con el más reciente primero', async () => {
        const primero = await crearMiembro();
        const segundo = await crearMiembro();
        const r1 = (await ingreso(recepcion1.token, primero.id)).body as { id: string };
        const r2 = (await ingreso(recepcion1.token, segundo.id)).body as { id: string };
        await salida(recepcion1.token, r1.id);

        const lista = (await listaHoy(recepcion1.token)).body as { id: string }[];

        const i1 = lista.findIndex((r) => r.id === r1.id);
        const i2 = lista.findIndex((r) => r.id === r2.id);
        expect(i2).toBeGreaterThanOrEqual(0);
        expect(i2).toBeLessThan(i1);
        expect(lista[i1]).toEqual({
            id: r1.id,
            miembro: { nombre: primero.nombre, codigo: primero.codigo },
            ingresoEn: expect.any(String) as string,
            salidaEn: expect.any(String) as string,
            estado: 'SALIO',
        });
        expect(lista[i2]).toMatchObject({ salidaEn: null, estado: 'DENTRO' });
    }, 20_000);

    it('C6 · a las 23:59 (reloj simulado) se cierra con CERRADO_AUTO; correrlo otra vez no cambia nada', async () => {
        const miembro = await crearMiembro();
        const { id } = (await ingreso(recepcion1.token, miembro.id)).body as { id: string };
        const cierre = app.get(CierreAutomaticoService);
        const las2359 = aFechaLocal(hoy, '23:59');

        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(las2359);
        const primera = await cierre.ejecutar();
        const segunda = await cierre.ejecutar();
        vi.useRealTimers();

        expect(primera).toBeGreaterThanOrEqual(1);
        expect(segunda).toBe(0);
        const registro = await prisma.registroAcceso.findUniqueOrThrow({ where: { id } });
        expect(registro).toMatchObject({ estado: EstadoAcceso.CERRADO_AUTO, salidaRegistradaPorId: null });
        expect(registro.salidaEn?.getTime()).toBe(las2359.getTime());
    }, 20_000);

    it('C7 · rechaza un segundo ingreso con uno abierto y una salida sin ingreso abierto', async () => {
        const miembro = await crearMiembro();
        const { id } = (await ingreso(recepcion1.token, miembro.id)).body as { id: string };

        const segundoIngreso = await ingreso(recepcion1.token, miembro.id);
        expect(segundoIngreso.status).toBe(409);
        expect((segundoIngreso.body as { message: string }).message).toBe(MENSAJES.yaDentro);

        expect((await salida(recepcion1.token, id)).status).toBe(200);
        const segundaSalida = await salida(recepcion1.token, id);
        expect(segundaSalida.status).toBe(409);
        expect((segundaSalida.body as { message: string }).message).toBe(MENSAJES.sinIngreso);
    }, 20_000);

    it('C7 · dos recepcionistas registran el mismo ingreso a la vez: solo uno queda', async () => {
        const miembro = await crearMiembro();

        const respuestas = await Promise.all([ingreso(recepcion1.token, miembro.id), ingreso(recepcion2.token, miembro.id)]);

        expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409]);
        expect(await prisma.registroAcceso.count({ where: { miembroId: miembro.id, estado: EstadoAcceso.DENTRO } })).toBe(1);
    }, 20_000);

    it.each([
        ['MIEMBRO', () => tokenMiembro],
        ['ENTRENADOR', () => tokenEntrenador],
    ])('C8 · %s recibe 403 "Acceso denegado" al registrar ingreso o salida', async (_rol, token) => {
        const miembro = await crearMiembro();
        const { id } = (await ingreso(recepcion1.token, miembro.id)).body as { id: string };

        for (const res of [await ingreso(token(), miembro.id), await salida(token(), id), await listaHoy(token())]) {
            expect(res.status).toBe(403);
            expect((res.body as { message: string }).message).toBe(MENSAJES.denegado);
        }
        expect((await prisma.registroAcceso.findUniqueOrThrow({ where: { id } })).estado).toBe(EstadoAcceso.DENTRO);
    }, 20_000);
});