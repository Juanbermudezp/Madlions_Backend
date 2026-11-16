// QA-17.1 · Pruebas de la consulta del estado de las máquinas (H17)

import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '@Prisma/services';
import { EstadoMaquina, TipoMaquina, ZonaMaquina } from '@PrismaClient';

const PREFIJO_PRUEBA = 'MAQ-8';
const CORREOS = {
  ADMINISTRADOR: 'admin@madlions.com',
  RECEPCION: 'recepcion@madlions.com',
  ENTRENADOR: 'entrenador@madlions.com',
  MIEMBRO: 'miembro@madlions.com',
} as const;
type RolPrueba = keyof typeof CORREOS;
const TODOS_LOS_ROLES = Object.keys(CORREOS) as RolPrueba[];
const SIN_DATOS_INTERNOS: RolPrueba[] = ['MIEMBRO', 'RECEPCION'];
const CON_DATOS_INTERNOS: RolPrueba[] = ['ADMINISTRADOR', 'ENTRENADOR'];
const PASSWORD = 'Demo1234!';

const COMBINACION_VACIA = { tipo: TipoMaquina.PESO_LIBRE, zona: ZonaMaquina.PISO_1 };
// QA-10: ninguna máquina del inventario la cumple, ni las tres que crea la prueba.
const COMBINACION_SIN_RESULTADOS = {
  estado: EstadoMaquina.FUERA_DE_SERVICIO,
  tipo: TipoMaquina.CARDIO,
};

const MOTIVO_MANTENIMIENTO = 'Banda desgastada, se espera el repuesto.';
const MOTIVO_FUERA_DE_SERVICIO = 'Tablero quemado, no tiene reparación.';

interface MaquinaRespuesta {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  zona: string;
  estado: string;
  fechaEstimadaRetorno: string | null;
  ultimoMotivo?: string | null;
  ultimoCambioPor?: { id: string; nombre: string; apellido: string } | null;
}

interface MaquinasRespuesta {
  resumen: Record<string, number>;
  maquinas: MaquinaRespuesta[];
}

describe('QA-17.1 · Consulta del estado de las máquinas (H17)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const token = {} as Record<RolPrueba, string>;
  let adminId: string;
  let fechaRetorno: string;

  const http = () => request(app.getHttpServer());
  const como = (rol: RolPrueba) => ({ Authorization: `Bearer ${token[rol]}` });
  const listar = (rol: RolPrueba, query: Record<string, string> = {}) =>
    http().get('/api/v1/maquinas').query(query).set(como(rol));
  const mensaje = (body: { message: string | string[] }) =>
    Array.isArray(body.message) ? body.message[0] : body.message;
  const buscar = (cuerpo: MaquinasRespuesta, codigo: string) =>
    cuerpo.maquinas.find((m) => m.codigo === codigo);

  beforeAll(async () => {
    const ref = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = ref.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);

    for (const [rol, email] of Object.entries(CORREOS) as [RolPrueba, string][]) {
      const res = await http().post('/api/v1/auth/login').send({ email, password: PASSWORD });
      if (res.status !== 200) {
        throw new Error(`No se pudo iniciar sesión con ${email}: corre npm run db:seed`);
      }
      token[rol] = (res.body as { accessToken: string }).accessToken;
    }

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: CORREOS.ADMINISTRADOR },
      select: { id: true },
    });
    adminId = admin.id;

    if ((await prisma.maquina.count()) < 12) {
      throw new Error('Falta el inventario de máquinas del seed: corre npm run db:seed');
    }
    if (await prisma.maquina.count({ where: COMBINACION_VACIA })) {
      throw new Error(
        `El seed cambió: ${COMBINACION_VACIA.tipo} en ${COMBINACION_VACIA.zona} ya no está vacío`,
      );
    }

    await prisma.maquina.deleteMany({ where: { codigo: { startsWith: PREFIJO_PRUEBA } } });

    const enTresDias = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    fechaRetorno = enTresDias.toISOString().slice(0, 10);

    await prisma.maquina.create({
      data: {
        codigo: 'MAQ-801',
        nombre: 'Caminadora QA-17.1',
        tipo: TipoMaquina.CARDIO,
        zona: ZonaMaquina.PISO_1,
        estado: EstadoMaquina.EN_MANTENIMIENTO,
        fechaEstimadaRetorno: new Date(`${fechaRetorno}T00:00:00Z`),
        ultimoMotivo: MOTIVO_MANTENIMIENTO,
        ultimoCambioPorId: adminId,
      },
    });
    await prisma.maquina.create({
      data: {
        codigo: 'MAQ-802',
        nombre: 'Prensa QA-17.1',
        tipo: TipoMaquina.FUERZA,
        zona: ZonaMaquina.PISO_2,
        estado: EstadoMaquina.FUERA_DE_SERVICIO,
        ultimoMotivo: MOTIVO_FUERA_DE_SERVICIO,
        ultimoCambioPorId: adminId,
      },
    });
    await prisma.maquina.create({
      data: {
        codigo: 'MAQ-803',
        nombre: 'TRX QA-17.1',
        tipo: TipoMaquina.FUNCIONAL,
        zona: ZonaMaquina.AREA_FUNCIONAL,
      },
    });

    if (await prisma.maquina.count({ where: COMBINACION_SIN_RESULTADOS })) {
      throw new Error(
        `Ya hay una máquina ${COMBINACION_SIN_RESULTADOS.tipo} ${COMBINACION_SIN_RESULTADOS.estado}: ` +
          'QA-10 necesita una combinación sin resultados',
      );
    }
  });

  afterAll(async () => {
    await prisma.maquina.deleteMany({ where: { codigo: { startsWith: PREFIJO_PRUEBA } } });
    await app.close();
  });

  describe('Criterio 1 · Cada máquina con nombre, tipo, zona y estado, y el resumen por estado', () => {
    it('QA-01 · el miembro recibe cada máquina con nombre, tipo, zona y estado', async () => {
      const res = await listar('MIEMBRO');
      expect(res.status).toBe(200);

      const cuerpo = res.body as MaquinasRespuesta;
      expect(cuerpo.maquinas.length).toBeGreaterThanOrEqual(15);
      for (const maquina of cuerpo.maquinas) {
        expect(maquina).toMatchObject({
          id: expect.any(String),
          codigo: expect.stringMatching(/^MAQ-\d{3}$/),
          nombre: expect.any(String),
          tipo: expect.stringMatching(/^(CARDIO|FUERZA|PESO_LIBRE|FUNCIONAL)$/),
          zona: expect.stringMatching(/^(PISO_1|PISO_2|AREA_FUNCIONAL)$/),
          estado: expect.stringMatching(/^(OPERATIVA|EN_MANTENIMIENTO|FUERA_DE_SERVICIO)$/),
        });
      }
    });

    it('QA-02 · el resumen trae los tres estados y suma el inventario completo', async () => {
      const cuerpo = (await listar('MIEMBRO')).body as MaquinasRespuesta;

      expect(Object.keys(cuerpo.resumen).sort()).toEqual([
        'EN_MANTENIMIENTO',
        'FUERA_DE_SERVICIO',
        'OPERATIVA',
      ]);
      const suma = Object.values(cuerpo.resumen).reduce((a, b) => a + b, 0);
      expect(suma).toBe(cuerpo.maquinas.length);
      expect(suma).toBe(await prisma.maquina.count());
    });

    it('QA-03 · el resumen cuenta bien cada estado', async () => {
      const cuerpo = (await listar('MIEMBRO')).body as MaquinasRespuesta;

      for (const estado of Object.values(EstadoMaquina)) {
        expect(cuerpo.resumen[estado]).toBe(await prisma.maquina.count({ where: { estado } }));
      }
      expect(cuerpo.resumen.EN_MANTENIMIENTO).toBeGreaterThanOrEqual(1);
      expect(cuerpo.resumen.FUERA_DE_SERVICIO).toBeGreaterThanOrEqual(1);
    });

    it('QA-04 · los cuatro roles pueden consultar el estado de las máquinas', async () => {
      for (const rol of TODOS_LOS_ROLES) {
        const res = await listar(rol);
        expect(res.status, `el rol ${rol} recibió ${res.status}`).toBe(200);
      }
    });

    it('QA-05 · sin sesión no se puede consultar', async () => {
      expect((await http().get('/api/v1/maquinas')).status).toBe(401);
    });
  });

  describe('Criterio 2 · Los filtros de estado, tipo y zona se combinan con AND', () => {
    it('QA-06 · filtra por estado', async () => {
      const cuerpo = (await listar('MIEMBRO', { estado: 'EN_MANTENIMIENTO' }))
        .body as MaquinasRespuesta;

      expect(cuerpo.maquinas.length).toBeGreaterThanOrEqual(1);
      expect(cuerpo.maquinas.every((m) => m.estado === 'EN_MANTENIMIENTO')).toBe(true);
      expect(buscar(cuerpo, 'MAQ-801')).toBeDefined();
      expect(buscar(cuerpo, 'MAQ-803')).toBeUndefined();
    });

    it('QA-07 · filtra por tipo', async () => {
      const cuerpo = (await listar('MIEMBRO', { tipo: 'FUNCIONAL' })).body as MaquinasRespuesta;

      expect(cuerpo.maquinas.length).toBeGreaterThanOrEqual(1);
      expect(cuerpo.maquinas.every((m) => m.tipo === 'FUNCIONAL')).toBe(true);
    });

    it('QA-08 · filtra por zona', async () => {
      const cuerpo = (await listar('MIEMBRO', { zona: 'PISO_2' })).body as MaquinasRespuesta;

      expect(cuerpo.maquinas.length).toBeGreaterThanOrEqual(1);
      expect(cuerpo.maquinas.every((m) => m.zona === 'PISO_2')).toBe(true);
    });

    it('QA-09 · con los tres filtros solo quedan las máquinas que cumplen todos', async () => {
      const cuerpo = (
        await listar('MIEMBRO', {
          estado: 'FUERA_DE_SERVICIO',
          tipo: 'FUERZA',
          zona: 'PISO_2',
        })
      ).body as MaquinasRespuesta;

      expect(cuerpo.maquinas).toHaveLength(1);
      expect(cuerpo.maquinas[0].codigo).toBe('MAQ-802');
    });

    it('QA-10 · un filtro que no cuadra con los otros deja la lista vacía', async () => {
      const cuerpo = (await listar('MIEMBRO', COMBINACION_SIN_RESULTADOS))
        .body as MaquinasRespuesta;

      expect(cuerpo.maquinas).toHaveLength(0);
    });

    it('QA-11 · el filtro vacío significa "todos" (?estado=&tipo=&zona=)', async () => {
      const res = await listar('MIEMBRO', { estado: '', tipo: '', zona: '' });
      expect(res.status).toBe(200);

      const cuerpo = res.body as MaquinasRespuesta;
      expect(cuerpo.maquinas.length).toBe(await prisma.maquina.count());
    });

    it('QA-12 · un estado, tipo o zona que no existe da 400', async () => {
      const estado = await listar('MIEMBRO', { estado: 'ROTA' });
      expect(estado.status).toBe(400);
      expect(mensaje(estado.body as { message: string | string[] })).toContain('El estado debe ser');

      const tipo = await listar('MIEMBRO', { tipo: 'PESAS' });
      expect(tipo.status).toBe(400);
      expect(mensaje(tipo.body as { message: string | string[] })).toContain('El tipo debe ser');

      const zona = await listar('MIEMBRO', { zona: 'PISO_3' });
      expect(zona.status).toBe(400);
      expect(mensaje(zona.body as { message: string | string[] })).toContain('La zona debe ser');
    });

    it('QA-13 · un filtro que no es parte del contrato da 400', async () => {
      expect((await listar('MIEMBRO', { marca: 'LifeFitness' })).status).toBe(400);
    });

    it('QA-14 · el filtro de estado no recorta el resumen; el de tipo y zona sí', async () => {
      const porEstado = (await listar('MIEMBRO', { estado: 'EN_MANTENIMIENTO' }))
        .body as MaquinasRespuesta;
      expect(porEstado.resumen.OPERATIVA).toBeGreaterThan(0);
      expect(porEstado.resumen).toEqual(
        ((await listar('MIEMBRO')).body as MaquinasRespuesta).resumen,
      );

      const porZona = (await listar('MIEMBRO', { zona: 'PISO_2' })).body as MaquinasRespuesta;
      const enPiso2 = await prisma.maquina.count({ where: { zona: ZonaMaquina.PISO_2 } });
      expect(Object.values(porZona.resumen).reduce((a, b) => a + b, 0)).toBe(enPiso2);
    });
  });

  describe('Criterio 3 · Las máquinas que no están operativas muestran su fecha estimada de retorno', () => {
    it('QA-15 · una máquina en mantenimiento devuelve la fecha estimada como AAAA-MM-DD', async () => {
      const cuerpo = (await listar('MIEMBRO')).body as MaquinasRespuesta;

      expect(buscar(cuerpo, 'MAQ-801')).toMatchObject({
        estado: 'EN_MANTENIMIENTO',
        fechaEstimadaRetorno: fechaRetorno,
      });
      expect(fechaRetorno).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('QA-16 · una máquina fuera de servicio sin fecha devuelve null ("Sin fecha estimada")', async () => {
      const cuerpo = (await listar('MIEMBRO')).body as MaquinasRespuesta;

      expect(buscar(cuerpo, 'MAQ-802')).toMatchObject({
        estado: 'FUERA_DE_SERVICIO',
        fechaEstimadaRetorno: null,
      });
    });

    it('QA-17 · una máquina operativa no tiene fecha estimada de retorno', async () => {
      const cuerpo = (await listar('MIEMBRO')).body as MaquinasRespuesta;

      expect(buscar(cuerpo, 'MAQ-803')).toMatchObject({
        estado: 'OPERATIVA',
        fechaEstimadaRetorno: null,
      });
      expect(cuerpo.maquinas.filter((m) => m.estado === 'OPERATIVA')).toSatisfy(
        (operativas: MaquinaRespuesta[]) =>
          operativas.every((m) => m.fechaEstimadaRetorno === null),
      );
    });
  });

  describe('Criterio 4 · Ningún resultado cumple los filtros', () => {
    it('QA-18 · una combinación sin máquinas devuelve la lista vacía, no un error', async () => {
      const res = await listar('MIEMBRO', COMBINACION_VACIA);
      expect(res.status).toBe(200);

      const cuerpo = res.body as MaquinasRespuesta;
      expect(cuerpo.maquinas).toEqual([]);
      expect(cuerpo.resumen).toBeDefined();
      expect(Object.keys(cuerpo.resumen).sort()).toEqual([
        'EN_MANTENIMIENTO',
        'FUERA_DE_SERVICIO',
        'OPERATIVA',
      ]);
    });
  });

  describe('Criterio 5 · El miembro no ve el motivo ni quién hizo el último cambio', () => {
    it('QA-19 · el miembro no recibe ultimoMotivo ni ultimoCambioPor', async () => {
      const res = await listar('MIEMBRO');
      const cuerpo = res.body as MaquinasRespuesta;
      const maquina = buscar(cuerpo, 'MAQ-801');

      expect(maquina).not.toHaveProperty('ultimoMotivo');
      expect(maquina).not.toHaveProperty('ultimoCambioPor');
      expect(maquina).not.toHaveProperty('ultimoCambioPorId');
      expect(res.text).not.toContain(MOTIVO_MANTENIMIENTO);
      expect(res.text).not.toContain(adminId);
    });

    it('QA-20 · recepción tampoco los recibe', async () => {
      for (const rol of SIN_DATOS_INTERNOS) {
        const res = await listar(rol);
        const maquina = buscar(res.body as MaquinasRespuesta, 'MAQ-802');

        expect(maquina, `el rol ${rol} no recibió MAQ-802`).toBeDefined();
        expect(maquina).not.toHaveProperty('ultimoMotivo');
        expect(maquina).not.toHaveProperty('ultimoCambioPor');
        expect(res.text).not.toContain(MOTIVO_FUERA_DE_SERVICIO);
      }
    });

    it('QA-21 · el administrador y el entrenador sí reciben el motivo y el usuario', async () => {
      for (const rol of CON_DATOS_INTERNOS) {
        const cuerpo = (await listar(rol)).body as MaquinasRespuesta;
        const maquina = buscar(cuerpo, 'MAQ-801');

        expect(maquina, `el rol ${rol} no recibió MAQ-801`).toMatchObject({
          ultimoMotivo: MOTIVO_MANTENIMIENTO,
          ultimoCambioPor: {
            id: adminId,
            nombre: expect.any(String),
            apellido: expect.any(String),
          },
        });
      }
    });

    it('QA-22 · una máquina que nunca cambió de estado llega con motivo y usuario en null', async () => {
      const cuerpo = (await listar('ADMINISTRADOR')).body as MaquinasRespuesta;

      expect(buscar(cuerpo, 'MAQ-803')).toMatchObject({
        ultimoMotivo: null,
        ultimoCambioPor: null,
      });
    });

    it('QA-23 · en H17 ningún rol puede modificar el estado: el endpoint no existe todavía', async () => {
      const maquina = await prisma.maquina.findUniqueOrThrow({ where: { codigo: 'MAQ-801' } });

      for (const rol of TODOS_LOS_ROLES) {
        const res = await http()
          .post(`/api/v1/maquinas/${maquina.id}/estado`)
          .set(como(rol))
          .send({ estado: 'OPERATIVA', motivo: 'Intento de cambio desde QA-17.1.' });
        expect(res.status, `el rol ${rol} recibió ${res.status}`).toBe(404);
      }

      const despues = await prisma.maquina.findUniqueOrThrow({ where: { codigo: 'MAQ-801' } });
      expect(despues.estado).toBe(EstadoMaquina.EN_MANTENIMIENTO);
    });
  });
});
