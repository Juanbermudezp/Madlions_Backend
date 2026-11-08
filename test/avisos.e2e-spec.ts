/**
 * QA-22.1 · Pruebas del servicio de avisos (H22, Módulo 9)
 *
 * Prueba AvisosService de punta a punta contra la base real del
 * docker-compose, con los miembros del seed. Cada bloque `describe` es un
 * criterio de aceptación de H22. Lo que crea se borra al terminar.
 *
 * Requisitos: migraciones aplicadas y `npm run db:seed`.
 * Ejecutar: npm run test:e2e
 * Detalle de los casos: docs/qa/QA-22.1-pruebas-servicio-avisos.md
 */
import { randomUUID } from 'node:crypto';
import { BadRequestException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { AvisosModule, AvisosService, type NuevoAviso } from '@Avisos';
import { PrismaService } from '@Prisma/services';
import { EstadoAviso, ModuloOrigen } from '@PrismaClient';

const PREFIJO = '[QA-22.1]';
const CORREOS = [
  'miembro@madlions.com',
  'demo@example.com',
  'inactivo@madlions.com',
];

describe('QA-22.1 · Servicio de avisos (H22)', () => {
  let app: INestApplication;
  let avisos: AvisosService;
  let prisma: PrismaService;
  let M1: string;
  let M2: string;
  let M3: string;
  // Hace únicas las referencias de esta corrida.
  const corrida = randomUUID().slice(0, 8);

  const aviso = (datos: Partial<NuevoAviso> = {}): NuevoAviso => ({
    destinatarios: [M1],
    titulo: `${PREFIJO} Clase cancelada: Yoga`,
    mensaje: 'La clase de Yoga fue cancelada por el gimnasio.',
    moduloOrigen: ModuloOrigen.CLASES,
    ...datos,
  });

  const contarAvisos = () =>
    prisma.aviso.count({ where: { titulo: { startsWith: PREFIJO } } });

  async function debeRechazar(datos: NuevoAviso): Promise<string[]> {
    const error: unknown = await avisos.enviar(datos).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    const respuesta = (error as BadRequestException).getResponse() as {
      message: string[];
    };
    return respuesta.message;
  }

  beforeAll(async () => {
    const ref = await Test.createTestingModule({
      imports: [AppModule, AvisosModule],
    }).compile();

    app = ref.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    avisos = app.get(AvisosService);
    prisma = app.get(PrismaService);

    const miembros = await prisma.miembro.findMany({
      where: { usuario: { email: { in: CORREOS } } },
      select: { id: true, usuario: { select: { email: true } } },
    });
    const porCorreo = new Map(miembros.map((m) => [m.usuario.email, m.id]));
    if (porCorreo.size !== CORREOS.length) {
      throw new Error('Faltan miembros del seed: corre npm run db:seed');
    }
    [M1, M2, M3] = CORREOS.map((correo) => porCorreo.get(correo)!);
  });

  afterAll(async () => {
    await prisma?.aviso.deleteMany({
      where: { titulo: { startsWith: PREFIJO } },
    });
    await app?.close();
  });

  describe('Criterio 1 · registra un aviso No leído por destinatario', () => {
    it('QA-01 · un destinatario: 1 aviso NO_LEIDO con fecha y hora', async () => {
      const antes = new Date();

      const resultado = await avisos.enviar(
        aviso({ titulo: `${PREFIJO} QA-01` }),
      );

      expect(resultado).toEqual({ creados: 1, omitidosPorDuplicado: 0 });
      const guardado = await prisma.aviso.findFirstOrThrow({
        where: { titulo: `${PREFIJO} QA-01` },
      });
      expect(guardado).toMatchObject({
        miembroId: M1,
        mensaje: 'La clase de Yoga fue cancelada por el gimnasio.',
        moduloOrigen: ModuloOrigen.CLASES,
        referencia: null,
        estado: EstadoAviso.NO_LEIDO,
        leidoEn: null,
      });
      expect(guardado.creadoEn.getTime()).toBeGreaterThanOrEqual(
        antes.getTime() - 1000,
      );
    });

    it('QA-02 · tres destinatarios: un aviso por cada uno', async () => {
      const resultado = await avisos.enviar(
        aviso({ titulo: `${PREFIJO} QA-02`, destinatarios: [M1, M2, M3] }),
      );

      expect(resultado).toEqual({ creados: 3, omitidosPorDuplicado: 0 });
      const guardados = await prisma.aviso.findMany({
        where: { titulo: `${PREFIJO} QA-02` },
      });
      expect(guardados.map((a) => a.miembroId).sort()).toEqual(
        [M1, M2, M3].sort(),
      );
      expect(guardados.every((a) => a.estado === EstadoAviso.NO_LEIDO)).toBe(
        true,
      );
    });
  });

  describe('Criterio 2 · el módulo de origen solo acepta el enum', () => {
    it('QA-03 · acepta MEMBRESIAS, CLASES, SESIONES y PAGOS', async () => {
      for (const moduloOrigen of Object.values(ModuloOrigen)) {
        const resultado = await avisos.enviar(
          aviso({ titulo: `${PREFIJO} QA-03 ${moduloOrigen}`, moduloOrigen }),
        );
        expect(resultado.creados).toBe(1);
      }
    });

    it('QA-04 · rechaza un módulo fuera del enum (RESERVAS)', async () => {
      const antes = await contarAvisos();

      const problemas = await debeRechazar(
        aviso({ moduloOrigen: 'RESERVAS' as ModuloOrigen }),
      );

      expect(problemas).toEqual([
        'moduloOrigen no es válido; usa MEMBRESIAS, CLASES, SESIONES, PAGOS.',
      ]);
      expect(await contarAvisos()).toBe(antes);
    });
  });

  describe('Criterio 3 · no duplica por referencia e informa los omitidos', () => {
    it('QA-05 · la misma referencia dos veces: la segunda no crea nada', async () => {
      const referencia = `clase-${corrida}-cancelada`;
      const datos = aviso({
        titulo: `${PREFIJO} QA-05`,
        destinatarios: [M1, M2],
        referencia,
      });

      expect(await avisos.enviar(datos)).toEqual({
        creados: 2,
        omitidosPorDuplicado: 0,
      });
      expect(await avisos.enviar(datos)).toEqual({
        creados: 0,
        omitidosPorDuplicado: 2,
      });
      expect(await prisma.aviso.count({ where: { referencia } })).toBe(2);
    });

    it('QA-06 · grupo con un miembro ya avisado: crea los demás y cuenta el omitido', async () => {
      const referencia = `membresia-${corrida}-vence`;
      await avisos.enviar(
        aviso({ titulo: `${PREFIJO} QA-06`, destinatarios: [M1], referencia }),
      );

      const resultado = await avisos.enviar(
        aviso({
          titulo: `${PREFIJO} QA-06`,
          destinatarios: [M1, M2, M3],
          referencia,
        }),
      );

      expect(resultado).toEqual({ creados: 2, omitidosPorDuplicado: 1 });
      expect(await prisma.aviso.count({ where: { referencia } })).toBe(3);
    });

    it('QA-07 · sin referencia nunca se considera duplicado', async () => {
      const datos = aviso({ titulo: `${PREFIJO} QA-07` });

      await avisos.enviar(datos);
      await avisos.enviar(datos);

      expect(
        await prisma.aviso.count({ where: { titulo: `${PREFIJO} QA-07` } }),
      ).toBe(2);
    });
  });

  describe('Criterio 4 · el destinatario ve el aviso en su bandeja', () => {
    it('QA-08 · el aviso es el más reciente de la bandeja del miembro y está No leído', async () => {
      await avisos.enviar(
        aviso({ titulo: `${PREFIJO} QA-08`, destinatarios: [M2] }),
      );

      // Misma consulta que usará la bandeja de H23 (GET /avisos/mios):
      // avisos del miembro, del más reciente al más antiguo.
      const [primero] = await prisma.aviso.findMany({
        where: { miembroId: M2 },
        orderBy: { creadoEn: 'desc' },
        take: 20,
      });

      expect(primero).toMatchObject({
        titulo: `${PREFIJO} QA-08`,
        estado: EstadoAviso.NO_LEIDO,
      });
      const ajenos = await prisma.aviso.count({
        where: { titulo: `${PREFIJO} QA-08`, miembroId: { not: M2 } },
      });
      expect(ajenos).toBe(0);
    });
  });

  describe('Criterio 5 · datos inválidos: error de validación y ningún aviso', () => {
    const casos: [string, () => Partial<NuevoAviso>, string][] = [
      [
        'QA-09 · sin destinatarios',
        () => ({ destinatarios: [] }),
        'destinatarios debe tener de 1 a 500 ids de miembro.',
      ],
      [
        'QA-10 · sin título',
        () => ({ titulo: '' }),
        'titulo debe tener de 1 a 100 caracteres.',
      ],
      [
        'QA-11 · título de 101 caracteres',
        () => ({ titulo: 'a'.repeat(101) }),
        'titulo debe tener de 1 a 100 caracteres.',
      ],
      [
        'QA-12 · mensaje vacío',
        () => ({ mensaje: '' }),
        'mensaje debe tener de 1 a 500 caracteres.',
      ],
      [
        'QA-13 · mensaje de 501 caracteres',
        () => ({ mensaje: 'a'.repeat(501) }),
        'mensaje debe tener de 1 a 500 caracteres.',
      ],
      [
        'QA-14 · más de 500 destinatarios',
        () => ({
          destinatarios: Array.from({ length: 501 }, () => randomUUID()),
        }),
        'destinatarios debe tener de 1 a 500 ids de miembro.',
      ],
    ];

    it.each(casos)('%s', async (_caso, cambios, problema) => {
      const antes = await contarAvisos();

      const problemas = await debeRechazar(aviso(cambios()));

      expect(problemas).toContain(problema);
      expect(await contarAvisos()).toBe(antes);
    });

    it('QA-15 · un destinatario que no es miembro: no registra ni a los válidos', async () => {
      const inexistente = randomUUID();
      const antes = await contarAvisos();

      const problemas = await debeRechazar(
        aviso({
          titulo: `${PREFIJO} QA-15`,
          destinatarios: [M1, M2, inexistente],
        }),
      );

      expect(problemas).toEqual([
        `destinatarios inexistentes: ${inexistente}.`,
      ]);
      expect(await contarAvisos()).toBe(antes);
    });

    it('QA-16 · un id que no es UUID: error de validación, no error 500', async () => {
      const problemas = await debeRechazar(aviso({ destinatarios: ['123'] }));

      expect(problemas).toEqual(['destinatarios con formato inválido: 123.']);
    });
  });

  describe('Criterio 6 · no existe endpoint para crear avisos', () => {
    it('QA-17 · un miembro con sesión no puede crear avisos por la API', async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'miembro@madlions.com', password: 'Demo1234!' })
        .expect(200);
      const token = (login.body as { accessToken: string }).accessToken;
      const antes = await contarAvisos();

      await request(app.getHttpServer())
        .post('/api/v1/avisos')
        .set('Authorization', `Bearer ${token}`)
        .send(aviso({ titulo: `${PREFIJO} QA-17` }))
        .expect(404);

      expect(await contarAvisos()).toBe(antes);
    });

    it('QA-18 · Swagger no documenta ninguna ruta que cree avisos', () => {
      const documento = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().build(),
      );

      // H23 agregará rutas de lectura y "marcar todos como leídos"; ninguna
      // ruta de avisos puede recibir un aviso nuevo.
      const creadoras = Object.entries(documento.paths).filter(
        ([ruta, operaciones]) =>
          /aviso/i.test(ruta) &&
          (operaciones.post || operaciones.put) &&
          !ruta.endsWith('/marcar-todos-leidos'),
      );
      expect(creadoras).toEqual([]);
    });
  });
});
