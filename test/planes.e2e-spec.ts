/**
 * QA-1.1 · Pruebas de la definición y administración de planes (H1)
 *
 * Prueba la API de punta a punta contra la base real del docker-compose, con
 * los usuarios del seed. Cada bloque `describe` es un criterio de aceptación
 * de H1. Lo que crea se borra al terminar (los planes llevan el prefijo
 * [QA-1.1] en el nombre) y el precio de la clase puntual vuelve a su valor.
 *
 * Requisitos: migraciones aplicadas y `npm run db:seed`.
 * Ejecutar: npm run test:e2e
 * Detalle de los casos: docs/qa/H1-pruebas-planes.md
 */
import { randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { ConfiguracionService } from '@Configuracion/services';
import { PrismaService } from '@Prisma/services';

const PREFIJO = '[QA-1.1]';
const CORREOS = {
  ADMINISTRADOR: 'admin@madlions.com',
  RECEPCION: 'recepcion@madlions.com',
  ENTRENADOR: 'entrenador@madlions.com',
  MIEMBRO: 'miembro@madlions.com',
} as const;
type RolPrueba = keyof typeof CORREOS;
const NO_ADMIN: RolPrueba[] = ['RECEPCION', 'ENTRENADOR', 'MIEMBRO'];
const PASSWORD = 'Demo1234!';
const ID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';

interface PlanRespuesta {
  id: string;
  nombre: string;
  tipo: string;
  precio: number;
  cantidadClases: number | null;
  duracionDias: number;
  beneficios: string;
  activo: boolean;
  tiposClase: { id: string; nombre: string }[];
}

describe('QA-1.1 · Definición y administración de planes (H1)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let configuracion: ConfiguracionService;
  const token = {} as Record<RolPrueba, string>;
  let tiposClase: { id: string; nombre: string }[];
  let precioOriginal: string;
  // Hace únicos los nombres de esta corrida.
  const corrida = randomUUID().slice(0, 6);
  const nombre = (texto: string) => `${PREFIJO} ${texto} ${corrida}`;

  const http = () => request(app.getHttpServer());
  const como = (rol: RolPrueba) => ({ Authorization: `Bearer ${token[rol]}` });
  const crear = (datos: Record<string, unknown>) =>
    http().post('/api/v1/planes').set(como('ADMINISTRADOR')).send(datos);
  const mensaje = (body: { message: string | string[] }) =>
    Array.isArray(body.message) ? body.message[0] : body.message;

  const planBase = (texto: string) => ({
    nombre: nombre(texto),
    tipo: 'MENSUAL',
    precio: 30,
    beneficios: 'Acceso a sala de máquinas.',
    tiposClaseIds: [] as string[],
  });

  /**
   * Huella del contenido de todas las tablas que no son de planes. Si editar
   * o desactivar un plan tocara otra tabla (membresías, cobros, etc.), la
   * huella cambiaría.
   */
  async function huellaOtrasTablas(): Promise<Record<string, string>> {
    const tablas = await prisma.$queryRaw<{ tabla: string }[]>`
      SELECT table_name AS tabla FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        AND table_name NOT IN ('plan', 'plan_tipo_clase', '_prisma_migrations')
      ORDER BY table_name`;
    const huella: Record<string, string> = {};
    for (const { tabla } of tablas) {
      const [fila] = await prisma.$queryRawUnsafe<{ h: string }[]>(
        `SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), '')) AS h FROM "${tabla}" t`,
      );
      huella[tabla] = fila.h;
    }
    return huella;
  }

  beforeAll(async () => {
    const ref = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = ref.createNestApplication();
    // Igual que main.ts.
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    configuracion = app.get(ConfiguracionService);

    for (const [rol, email] of Object.entries(CORREOS) as [RolPrueba, string][]) {
      const res = await http().post('/api/v1/auth/login').send({ email, password: PASSWORD });
      if (res.status !== 200) {
        throw new Error(`No se pudo iniciar sesión con ${email}: corre npm run db:seed`);
      }
      token[rol] = (res.body as { accessToken: string }).accessToken;
    }

    const tipos = await http().get('/api/v1/tipos-clase').set(como('ADMINISTRADOR'));
    tiposClase = tipos.body as { id: string; nombre: string }[];
    if (tiposClase.length < 2) throw new Error('Faltan tipos de clase del seed: corre npm run db:seed');

    precioOriginal = await configuracion.obtenerPrecioClasePuntual();
  });

  afterAll(async () => {
    await prisma.plan.deleteMany({ where: { nombre: { startsWith: PREFIJO } } });
    await prisma.configuracion.update({
      where: { clave: 'precio_clase_puntual' },
      data: { valor: precioOriginal },
    });
    await app.close();
  });

  describe('Criterio 1 · Registrar planes de los tres tipos, activos y en el catálogo', () => {
    const creados: PlanRespuesta[] = [];

    it('QA-01 · registra un Daypass activo', async () => {
      const res = await crear({ ...planBase('Daypass'), tipo: 'DAYPASS', precio: 5 });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ tipo: 'DAYPASS', precio: 5, activo: true });
      creados.push(res.body as PlanRespuesta);
    });

    it('QA-02 · registra un Mensual activo con sus tipos de clase', async () => {
      const ids = tiposClase.slice(0, 2).map((t) => t.id);
      const res = await crear({ ...planBase('Mensual'), precio: 35.5, tiposClaseIds: ids });
      expect(res.status).toBe(201);
      const plan = res.body as PlanRespuesta;
      expect(plan).toMatchObject({ tipo: 'MENSUAL', precio: 35.5, activo: true, cantidadClases: null });
      expect(plan.tiposClase.map((t) => t.id).sort()).toEqual([...ids].sort());
      creados.push(plan);
    });

    it('QA-03 · registra un Set de clases mensual activo', async () => {
      const res = await crear({ ...planBase('Set'), tipo: 'SET_CLASES', precio: 50, cantidadClases: 10 });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ tipo: 'SET_CLASES', cantidadClases: 10, activo: true });
      creados.push(res.body as PlanRespuesta);
    });

    it('QA-04 · los tres aparecen en el catálogo que ven los miembros', async () => {
      const res = await http().get('/api/v1/planes').set(como('MIEMBRO'));
      expect(res.status).toBe(200);
      const ids = (res.body as PlanRespuesta[]).map((p) => p.id);
      for (const plan of creados) expect(ids).toContain(plan.id);
    });
  });

  describe('Criterio 2 · Duración de cobertura y sets de 1 a 100 clases', () => {
    it('QA-05 · Daypass cubre 1 día; Mensual y Set cubren 30 días', async () => {
      const daypass = await crear({ ...planBase('Dur daypass'), tipo: 'DAYPASS' });
      const mensual = await crear(planBase('Dur mensual'));
      const set = await crear({ ...planBase('Dur set'), tipo: 'SET_CLASES', cantidadClases: 5 });
      expect(daypass.body.duracionDias).toBe(1);
      expect(mensual.body.duracionDias).toBe(30);
      expect(set.body.duracionDias).toBe(30);
    });

    it('QA-06 · la duración no se puede enviar: la fija el tipo', async () => {
      const res = await crear({ ...planBase('Dur manual'), duracionDias: 90 });
      expect(res.status).toBe(400);
    });

    it('QA-07 · acepta sets de 1 y de 100 clases', async () => {
      const uno = await crear({ ...planBase('Set 1'), tipo: 'SET_CLASES', cantidadClases: 1 });
      const cien = await crear({ ...planBase('Set 100'), tipo: 'SET_CLASES', cantidadClases: 100 });
      expect([uno.status, cien.status]).toEqual([201, 201]);
    });

    it.each([0, 101])('QA-08 · rechaza un set de %s clases', async (cantidad) => {
      const res = await crear({ ...planBase(`Set ${cantidad}`), tipo: 'SET_CLASES', cantidadClases: cantidad });
      expect(res.status).toBe(400);
      expect(mensaje(res.body)).toBe('La cantidad de clases debe ser un entero entre 1 y 100.');
    });

    it('QA-09 · un set sin cantidad de clases se rechaza', async () => {
      const res = await crear({ ...planBase('Set sin'), tipo: 'SET_CLASES' });
      expect(res.status).toBe(400);
      expect(mensaje(res.body)).toBe('Los planes SET_CLASES requieren cantidadClases entre 1 y 100.');
    });

    it('QA-10 · Daypass y Mensual no admiten cantidad de clases', async () => {
      const res = await crear({ ...planBase('Mensual con clases'), cantidadClases: 5 });
      expect(res.status).toBe(400);
      expect(mensaje(res.body)).toBe('Solo los planes SET_CLASES llevan cantidadClases.');
    });
  });

  describe('Criterio 3 · Precio de la clase puntual para nuevas sesiones', () => {
    it('QA-11 · todos los roles consultan el precio vigente', async () => {
      for (const rol of Object.keys(CORREOS) as RolPrueba[]) {
        const res = await http().get('/api/v1/configuracion/precio-clase-puntual').set(como(rol));
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ precio: precioOriginal });
      }
    });

    it('QA-12 · el administrador cambia el precio y queda con 2 decimales', async () => {
      const res = await http()
        .put('/api/v1/configuracion/precio-clase-puntual')
        .set(como('ADMINISTRADOR'))
        .send({ precio: 12.5 });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ precio: '12.50' });
    });

    it('QA-13 · el precio nuevo es el que entrega obtenerPrecioClasePuntual() a las sesiones (BE-9.2)', async () => {
      await expect(configuracion.obtenerPrecioClasePuntual()).resolves.toBe('12.50');
      const res = await http().get('/api/v1/configuracion/precio-clase-puntual').set(como('MIEMBRO'));
      expect(res.body).toEqual({ precio: '12.50' });
    });

    it.each([0, -5, 12.555])('QA-14 · rechaza el precio %s', async (precio) => {
      const res = await http()
        .put('/api/v1/configuracion/precio-clase-puntual')
        .set(como('ADMINISTRADOR'))
        .send({ precio });
      expect(res.status).toBe(400);
      expect(res.body.message).toEqual(['El precio debe ser mayor que 0 y tener como máximo 2 decimales.']);
    });
  });

  describe('Criterio 4 · Editar no toca membresías ni cobros, y el tipo no cambia', () => {
    let plan: PlanRespuesta;

    beforeAll(async () => {
      const res = await crear({ ...planBase('Editable'), tiposClaseIds: [tiposClase[0].id] });
      plan = res.body as PlanRespuesta;
    });

    it('QA-15 · edita nombre, precio, beneficios y tipos de clase', async () => {
      const res = await http()
        .patch(`/api/v1/planes/${plan.id}`)
        .set(como('ADMINISTRADOR'))
        .send({
          nombre: nombre('Editado'),
          precio: 42.25,
          beneficios: 'Sala y clases grupales.',
          tiposClaseIds: [tiposClase[1].id],
        });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ nombre: nombre('Editado'), precio: 42.25, beneficios: 'Sala y clases grupales.' });
      expect((res.body as PlanRespuesta).tiposClase.map((t) => t.id)).toEqual([tiposClase[1].id]);
    });

    it('QA-16 · el tipo enviado se ignora: el plan sigue siendo MENSUAL', async () => {
      const res = await http()
        .patch(`/api/v1/planes/${plan.id}`)
        .set(como('ADMINISTRADOR'))
        .send({ tipo: 'DAYPASS', precio: 40 });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ tipo: 'MENSUAL', duracionDias: 30, precio: 40 });
    });

    it('QA-17 · editar el plan no modifica ninguna otra tabla (membresías, cobros, usuarios…)', async () => {
      const antes = await huellaOtrasTablas();
      const res = await http()
        .patch(`/api/v1/planes/${plan.id}`)
        .set(como('ADMINISTRADOR'))
        .send({ precio: 99.99, beneficios: 'Cambio de prueba.', tiposClaseIds: [] });
      expect(res.status).toBe(200);
      expect(await huellaOtrasTablas()).toEqual(antes);
    });

    it('QA-18 · editar un plan inexistente responde 404', async () => {
      const res = await http()
        .patch(`/api/v1/planes/${ID_INEXISTENTE}`)
        .set(como('ADMINISTRADOR'))
        .send({ precio: 10 });
      expect(res.status).toBe(404);
    });
  });

  describe('Criterio 5 · Desactivar quita el plan de la venta sin afectar lo vendido', () => {
    let plan: PlanRespuesta;

    beforeAll(async () => {
      plan = (await crear(planBase('Desactivable'))).body as PlanRespuesta;
    });

    it('QA-19 · desactiva el plan sin modificar ninguna otra tabla', async () => {
      const antes = await huellaOtrasTablas();
      const res = await http().patch(`/api/v1/planes/${plan.id}/desactivar`).set(como('ADMINISTRADOR'));
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: plan.id, activo: false });
      expect(await huellaOtrasTablas()).toEqual(antes);
    });

    it.each(['MIEMBRO', 'RECEPCION', 'ENTRENADOR'] as RolPrueba[])(
      'QA-20 · el plan inactivo ya no aparece en el catálogo de %s (no se puede comprar ni renovar)',
      async (rol) => {
        const res = await http().get('/api/v1/planes').set(como(rol));
        expect((res.body as PlanRespuesta[]).map((p) => p.id)).not.toContain(plan.id);
      },
    );

    it('QA-21 · el administrador lo sigue viendo, marcado como inactivo', async () => {
      const res = await http().get('/api/v1/planes').set(como('ADMINISTRADOR'));
      const encontrado = (res.body as PlanRespuesta[]).find((p) => p.id === plan.id);
      expect(encontrado?.activo).toBe(false);
    });

    it('QA-22 · desactivarlo otra vez responde 409', async () => {
      const res = await http().patch(`/api/v1/planes/${plan.id}/desactivar`).set(como('ADMINISTRADOR'));
      expect(res.status).toBe(409);
      expect(res.body.message).toBe('El plan ya está inactivo.');
    });
  });

  describe('Criterio 6 · Campos obligatorios, precio, cantidades y nombre único', () => {
    it.each(['nombre', 'tipo', 'precio', 'beneficios', 'tiposClaseIds'])(
      'QA-23 · falta %s → 400',
      async (campo) => {
        const datos: Record<string, unknown> = planBase(`Falta ${campo}`);
        delete datos[campo];
        const res = await crear(datos);
        expect(res.status).toBe(400);
      },
    );

    it.each([0, -10, 10.555])('QA-24 · precio %s → 400', async (precio) => {
      const res = await crear({ ...planBase(`Precio ${precio}`), precio });
      expect(res.status).toBe(400);
      expect(mensaje(res.body)).toBe('El precio debe ser mayor que 0 y tener como máximo 2 decimales.');
    });

    it('QA-25 · nombre repetido (sin importar mayúsculas) → 409', async () => {
      await crear(planBase('Único'));
      const res = await crear({ ...planBase('x'), nombre: nombre('Único').toUpperCase() });
      expect(res.status).toBe(409);
      expect(res.body.message).toBe('Ya existe un plan con ese nombre');
    });

    it('QA-26 · nombre de más de 60 caracteres y beneficios de más de 500 → 400', async () => {
      const largo = await crear({ ...planBase('x'), nombre: `${PREFIJO} ${'x'.repeat(60)}` });
      const beneficios = await crear({ ...planBase('Beneficios'), beneficios: 'x'.repeat(501) });
      expect(mensaje(largo.body)).toBe('El nombre es obligatorio y puede tener hasta 60 caracteres.');
      expect(mensaje(beneficios.body)).toBe('Los beneficios son obligatorios y pueden tener hasta 500 caracteres.');
    });

    it('QA-27 · tipo de clase inexistente → 400', async () => {
      const res = await crear({ ...planBase('Tipo falso'), tiposClaseIds: [ID_INEXISTENTE] });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Uno o más tipos de clase no existen.');
    });

    it('QA-28 · nombre repetido al editar → 409', async () => {
      await crear(planBase('Ocupado'));
      const otro = (await crear(planBase('Libre'))).body as PlanRespuesta;
      const res = await http()
        .patch(`/api/v1/planes/${otro.id}`)
        .set(como('ADMINISTRADOR'))
        .send({ nombre: nombre('Ocupado') });
      expect(res.status).toBe(409);
    });
  });

  describe('Criterio 7 · Solo ADMINISTRADOR modifica planes y precios', () => {
    let plan: PlanRespuesta;

    beforeAll(async () => {
      plan = (await crear(planBase('Permisos'))).body as PlanRespuesta;
    });

    it('QA-29 · sin sesión responde 401', async () => {
      const res = await http().get('/api/v1/planes');
      expect(res.status).toBe(401);
    });

    it('QA-30 · los 4 roles consultan los planes', async () => {
      for (const rol of Object.keys(CORREOS) as RolPrueba[]) {
        const res = await http().get('/api/v1/planes').set(como(rol));
        expect(res.status).toBe(200);
      }
    });

    it.each(NO_ADMIN)('QA-31 · %s recibe 403 al crear, editar, desactivar y cambiar el precio', async (rol) => {
      const respuestas = await Promise.all([
        http().post('/api/v1/planes').set(como(rol)).send(planBase(`Intento ${rol}`)),
        http().patch(`/api/v1/planes/${plan.id}`).set(como(rol)).send({ precio: 1 }),
        http().patch(`/api/v1/planes/${plan.id}/desactivar`).set(como(rol)),
        http().put('/api/v1/configuracion/precio-clase-puntual').set(como(rol)).send({ precio: 1 }),
      ]);
      for (const res of respuestas) {
        expect(res.status).toBe(403);
        expect(res.body.message).toBe('No tienes permiso para realizar esta acción.');
      }
      const actual = await prisma.plan.findUniqueOrThrow({ where: { id: plan.id } });
      expect(actual.activo).toBe(true);
      expect(actual.precio.toNumber()).toBe(30);
    });

    it('QA-32 · el ADMINISTRADOR sí puede editar', async () => {
      const res = await http().patch(`/api/v1/planes/${plan.id}`).set(como('ADMINISTRADOR')).send({ precio: 31 });
      expect(res.status).toBe(200);
    });
  });
});
