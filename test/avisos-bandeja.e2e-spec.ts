/**
 * QA-23.1 (parte backend) · Bandeja de avisos (H23, Módulo 9)
 *
 * Prueba los endpoints de BE-23.1 de punta a punta contra la base real del
 * docker-compose, con los usuarios del seed. Los avisos se crean con
 * AvisosService (H22), como lo harán los demás módulos. Lo que crea se borra
 * al terminar (todos llevan el prefijo [QA-23.1] en el título).
 *
 * Ojo: el caso "marcar todos como leídos" deja leídos también los avisos que
 * ya tuviera miembro@madlions.com en tu base local.
 *
 * Requisitos: migraciones aplicadas y `npm run db:seed`.
 * Ejecutar: npm run test:e2e
 * Detalle de los casos: docs/qa/QA-23.1-pruebas-bandeja-avisos.md
 */
import { randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { AvisosService } from '@Avisos';
import { PrismaService } from '@Prisma/services';
import { EstadoAviso, ModuloOrigen } from '@PrismaClient';

const PREFIJO = '[QA-23.1]';
const CLAVE = 'Demo1234!';

interface Resumen {
  id: string;
  titulo: string;
  moduloOrigen: string;
  creadoEn: string;
  estado: string;
}
interface Pagina {
  items: Resumen[];
  total: number;
  pagina: number;
}

describe('QA-23.1 · Bandeja de avisos (H23)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let avisos: AvisosService;
  let tokenM1: string;
  let tokenM2: string;
  let tokenEntrenador: string;
  let M1: string;
  let M2: string;
  /** El aviso de M2 que M1 intentará abrir. */
  let avisoDeM2: string;
  let totalAntes: number;
  let noLeidosAntes: number;

  const http = () => request(app.getHttpServer());
  const get = (ruta: string, token: string) =>
    http().get(`/api/v1/avisos${ruta}`).set('Authorization', `Bearer ${token}`);

  async function login(email: string): Promise<string> {
    const respuesta = await http()
      .post('/api/v1/auth/login')
      .send({ email, password: CLAVE })
      .expect(200);
    return (respuesta.body as { accessToken: string }).accessToken;
  }

  async function miembroDe(email: string): Promise<string> {
    const miembro = await prisma.miembro.findFirst({
      where: { usuario: { email } },
      select: { id: true },
    });
    if (!miembro)
      throw new Error('Faltan miembros del seed: corre npm run db:seed');
    return miembro.id;
  }

  beforeAll(async () => {
    const ref = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = ref.createNestApplication();
    // Igual que main.ts.
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    avisos = app.get(AvisosService);
    M1 = await miembroDe('miembro@madlions.com');
    M2 = await miembroDe('demo@example.com');
    [tokenM1, tokenM2, tokenEntrenador] = await Promise.all([
      login('miembro@madlions.com'),
      login('demo@example.com'),
      login('entrenador@madlions.com'),
    ]);

    totalAntes = await prisma.aviso.count({ where: { miembroId: M1 } });
    noLeidosAntes = await prisma.aviso.count({
      where: { miembroId: M1, estado: EstadoAviso.NO_LEIDO },
    });

    // 25 avisos para M1, uno a la vez para que cada uno tenga su propia hora.
    for (let i = 1; i <= 25; i++) {
      await avisos.enviar({
        destinatarios: [M1],
        titulo: `${PREFIJO} Aviso ${String(i).padStart(2, '0')}`,
        mensaje: `Mensaje completo del aviso ${i}.`,
        moduloOrigen: i % 2 ? ModuloOrigen.CLASES : ModuloOrigen.MEMBRESIAS,
      });
    }
    await avisos.enviar({
      destinatarios: [M2],
      titulo: `${PREFIJO} Aviso de otro miembro`,
      mensaje: 'Este aviso es de demo@example.com.',
      moduloOrigen: ModuloOrigen.PAGOS,
    });
    avisoDeM2 = (
      await prisma.aviso.findFirstOrThrow({
        where: { miembroId: M2, titulo: `${PREFIJO} Aviso de otro miembro` },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma?.aviso.deleteMany({
      where: { titulo: { startsWith: PREFIJO } },
    });
    await app?.close();
  });

  describe('Lista de 20 en 20, del más reciente al más antiguo', () => {
    it('QA-B01 · página 1: 20 avisos, sin el mensaje, el más reciente primero', async () => {
      const { body } = await get('/mios', tokenM1).expect(200);
      const pagina = body as Pagina;

      expect(pagina.pagina).toBe(1);
      expect(pagina.total).toBe(totalAntes + 25);
      expect(pagina.items).toHaveLength(20);
      expect(pagina.items[0]).toEqual({
        id: expect.any(String),
        titulo: `${PREFIJO} Aviso 25`,
        moduloOrigen: ModuloOrigen.CLASES,
        creadoEn: expect.any(String),
        estado: EstadoAviso.NO_LEIDO,
      });
      const fechas = pagina.items.map((a) => a.creadoEn);
      expect([...fechas].sort().reverse()).toEqual(fechas);
    });

    it('QA-B02 · página 2: siguen los avisos sin repetir ninguno', async () => {
      const uno = (await get('/mios?pagina=1', tokenM1).expect(200))
        .body as Pagina;
      const dos = (await get('/mios?pagina=2', tokenM1).expect(200))
        .body as Pagina;

      expect(dos.pagina).toBe(2);
      expect(dos.items).toHaveLength(Math.min(20, dos.total - 20));
      expect(dos.items.slice(0, 5).map((a) => a.titulo)).toEqual(
        ['05', '04', '03', '02', '01'].map((n) => `${PREFIJO} Aviso ${n}`),
      );
      const ids = new Set(uno.items.map((a) => a.id));
      expect(dos.items.some((a) => ids.has(a.id))).toBe(false);
    });

    it('QA-B03 · filtro soloNoLeidos=true: solo avisos sin leer', async () => {
      const { body } = await get('/mios?soloNoLeidos=true', tokenM1).expect(
        200,
      );
      const pagina = body as Pagina;

      expect(pagina.total).toBe(noLeidosAntes + 25);
      expect(pagina.items.every((a) => a.estado === EstadoAviso.NO_LEIDO)).toBe(
        true,
      );
    });

    it('QA-B04 · parámetros inválidos: 400', async () => {
      await get('/mios?soloNoLeidos=si', tokenM1).expect(400);
      await get('/mios?pagina=0', tokenM1).expect(400);
      await get(`/mios?miembroId=${M2}`, tokenM1).expect(400);
    });
  });

  describe('Contador y lectura de un aviso', () => {
    it('QA-B05 · el contador cuenta los no leídos del miembro', async () => {
      const { body } = await get('/no-leidos/conteo', tokenM1).expect(200);
      expect(body).toEqual({ noLeidos: noLeidosAntes + 25 });
    });

    it('QA-B06 · abrir un aviso propio: mensaje completo, queda Leído y el contador baja', async () => {
      const [primero] = ((await get('/mios', tokenM1)).body as Pagina).items;

      const { body } = await get(`/${primero.id}`, tokenM1).expect(200);

      expect(body).toMatchObject({
        id: primero.id,
        titulo: `${PREFIJO} Aviso 25`,
        mensaje: 'Mensaje completo del aviso 25.',
        estado: EstadoAviso.LEIDO,
        leidoEn: expect.any(String),
      });
      const conteo = (await get('/no-leidos/conteo', tokenM1)).body as {
        noLeidos: number;
      };
      expect(conteo.noLeidos).toBe(noLeidosAntes + 24);

      // Abrirlo otra vez no cambia la fecha de lectura.
      const otraVez = await get(`/${primero.id}`, tokenM1).expect(200);
      expect((otraVez.body as { leidoEn: string }).leidoEn).toBe(
        (body as { leidoEn: string }).leidoEn,
      );
    });

    it('QA-B07 · abrir el aviso de otro miembro: 403 y el aviso sigue sin leer', async () => {
      const { body } = await get(`/${avisoDeM2}`, tokenM1).expect(403);

      expect(body).toMatchObject({
        statusCode: 403,
        message: 'No tienes permiso para ver este recurso.',
      });
      const aviso = await prisma.aviso.findUniqueOrThrow({
        where: { id: avisoDeM2 },
      });
      expect(aviso.estado).toBe(EstadoAviso.NO_LEIDO);
    });

    it('QA-B08 · aviso inexistente: 404; id que no es UUID: 400', async () => {
      await get(`/${randomUUID()}`, tokenM1).expect(404);
      await get('/no-es-un-id', tokenM1).expect(400);
    });
  });

  describe('Marcar todos como leídos', () => {
    it('QA-B09 · deja en 0 el contador del miembro y no toca a los demás', async () => {
      const antes = (
        (await get('/no-leidos/conteo', tokenM1)).body as { noLeidos: number }
      ).noLeidos;

      const { body } = await http()
        .post('/api/v1/avisos/marcar-todos-leidos')
        .set('Authorization', `Bearer ${tokenM1}`)
        .expect(200);

      expect(body).toEqual({ actualizados: antes });
      expect((await get('/no-leidos/conteo', tokenM1)).body).toEqual({
        noLeidos: 0,
      });
      const deM2 = await get(`/mios?soloNoLeidos=true`, tokenM2).expect(200);
      expect((deM2.body as Pagina).items.map((a) => a.id)).toContain(avisoDeM2);
    });
  });

  describe('Permisos', () => {
    it('QA-B10 · un entrenador no tiene bandeja de avisos: 403', async () => {
      await get('/mios', tokenEntrenador).expect(403);
      await get('/no-leidos/conteo', tokenEntrenador).expect(403);
    });

    it('QA-B11 · sin sesión: 401', async () => {
      await http().get('/api/v1/avisos/mios').expect(401);
      await http().get('/api/v1/avisos/no-leidos/conteo').expect(401);
    });
  });
});
