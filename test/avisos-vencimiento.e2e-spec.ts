/**
 * QA-24.1 · Aviso de próximo vencimiento de membresía (H24, Módulo 9)
 *
 * Ejecuta la tarea de BE-24.1 a mano (avisarVencimientos con un reloj
 * simulado) contra la base real del docker-compose. Para que ninguna membresía
 * de tu base local entre en el rango, "hoy" es un día al azar muy en el futuro
 * y las membresías de prueba se crean alrededor de ese día. Todo lo que crea
 * (usuarios qa24-, miembros, planes [QA-24.1], membresías y avisos) se borra
 * al terminar.
 *
 * Requisitos: migraciones aplicadas y `npm run db:seed`.
 * Ejecutar: npm run test:e2e
 * Detalle de los casos: docs/qa/QA-24.1-pruebas-aviso-vencimiento.md
 */
import { randomInt, randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import {
  AvisosVencimientoService,
  TITULO_VENCIMIENTO,
  referenciaVencimiento,
} from '@Avisos/services';
import { sumarDias } from '@Common/fechas';
import { PrismaService } from '@Prisma/services';
import {
  EstadoMembresia,
  ModuloOrigen,
  TipoOperacionMembresia,
  TipoPlan,
} from '@PrismaClient';

const PREFIJO = '[QA-24.1]';
const CLAVE = 'Demo1234!';

/** "AAAA-MM-DD" → "dd/mm/aaaa". */
const aDiaMesAnio = (fecha: string) => fecha.split('-').reverse().join('/');
const textoBase = (plan: string, vence: string) =>
  `Tu plan ${plan} vence el ${aDiaMesAnio(vence)}. Desde esa fecha puedes ` +
  'pagar tu renovación; acércate a recepción para registrarla.';

interface Caso {
  miembroId: string;
  email: string;
  membresiaId: string;
}

describe('QA-24.1 · Aviso de próximo vencimiento de membresía (H24)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tarea: AvisosVencimientoService;
  const corrida = randomUUID().slice(0, 6);
  let siguiente = randomInt(100_000, 899_000);
  /** Un día entre 2099 y ~2180, distinto en cada corrida. */
  const hoy = sumarDias('2099-01-01', randomInt(0, 30_000));
  /** La tarea de las 06:00 de El Salvador (12:00 UTC) del día hoy + n. */
  const a6 = (n = 0) => new Date(`${sumarDias(hoy, n)}T12:00:00.000Z`);
  const dia = (n: number) => new Date(`${sumarDias(hoy, n)}T00:00:00.000Z`);

  const usuarios: string[] = [];
  const miembros: string[] = [];
  const planes: string[] = [];
  let passwordHash: string;
  let recepcionId: string;
  const plan = {} as Record<'mensual' | 'set' | 'daypass', string>;
  const nombre = {
    mensual: `${PREFIJO} Mensual ${corrida}`,
    set: `${PREFIJO} Set 8 ${corrida}`,
    daypass: `${PREFIJO} Daypass ${corrida}`,
  };
  const casos = {} as Record<
    'a4' | 'a3' | 'a1' | 'a0' | 'daypass' | 'set' | 'renovada',
    Caso
  >;

  const http = () => request(app.getHttpServer());

  async function login(email: string): Promise<string> {
    const res = await http()
      .post('/api/v1/auth/login')
      .send({ email, password: CLAVE });
    if (res.status !== 200)
      throw new Error(`No se pudo iniciar sesión con ${email}`);
    return (res.body as { accessToken: string }).accessToken;
  }

  /**
   * Miembro nuevo con una membresía PAGADA que vence en hoy + `vence`.
   * Mensual y set duran 30 días; el Daypass, uno.
   */
  async function crearCaso(
    tipo: 'mensual' | 'set' | 'daypass',
    vence: number,
  ): Promise<Caso> {
    const n = siguiente++;
    const email = `qa24-${corrida}-${n}@test.com`;
    const usuario = await prisma.user.create({
      data: {
        email,
        passwordHash,
        nombre: 'Prueba',
        apellido: `QA24 ${corrida} ${n}`,
        telefono: String(77_000_000 + n).slice(0, 8),
      },
    });
    usuarios.push(usuario.id);
    const miembro = await prisma.miembro.create({
      data: {
        usuarioId: usuario.id,
        documento: `${String(n).padStart(8, '0')}-${n % 10}`,
        codigoMiembro: `MBR-${String(n).padStart(6, '0')}`,
      },
    });
    miembros.push(miembro.id);

    const inicio = tipo === 'daypass' ? vence : vence - 29;
    const membresia = await prisma.membresia.create({
      data: {
        miembroId: miembro.id,
        planId: plan[tipo],
        nombrePlan: nombre[tipo],
        tipoPlan: {
          mensual: TipoPlan.MENSUAL,
          set: TipoPlan.SET_CLASES,
          daypass: TipoPlan.DAYPASS,
        }[tipo],
        precio: { mensual: 30, set: 25, daypass: 5 }[tipo],
        cantidadClases: tipo === 'set' ? 8 : null,
        tipoOperacion: TipoOperacionMembresia.COMPRA,
        estado: EstadoMembresia.PAGADA,
        fechaInicioSolicitada: dia(inicio),
        fechaInicio: dia(inicio),
        fechaVencimiento: dia(vence),
        registradaPorId: recepcionId,
      },
    });
    return { miembroId: miembro.id, email, membresiaId: membresia.id };
  }

  const avisosDe = (caso: Caso) =>
    prisma.aviso.findMany({ where: { miembroId: caso.miembroId } });

  beforeAll(async () => {
    const ref = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = ref.createNestApplication();
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
    tarea = app.get(AvisosVencimientoService);

    const recepcion = await prisma.user.findUnique({
      where: { email: 'recepcion@madlions.com' },
    });
    if (!recepcion) throw new Error('Falta el seed: corre npm run db:seed');
    recepcionId = recepcion.id;
    passwordHash = recepcion.passwordHash; // Demo1234!

    const crearPlan = async (
      clave: keyof typeof plan,
      tipo: TipoPlan,
      precio: number,
      duracionDias: number,
      cantidadClases: number | null,
    ) => {
      plan[clave] = (
        await prisma.plan.create({
          data: {
            nombre: nombre[clave],
            tipo,
            precio,
            duracionDias,
            cantidadClases,
            beneficios: 'Prueba H24',
          },
        })
      ).id;
      planes.push(plan[clave]);
    };
    await crearPlan('mensual', TipoPlan.MENSUAL, 30, 30, null);
    await crearPlan('set', TipoPlan.SET_CLASES, 25, 30, 8);
    await crearPlan('daypass', TipoPlan.DAYPASS, 5, 1, null);

    casos.a4 = await crearCaso('mensual', 4);
    casos.a3 = await crearCaso('mensual', 3);
    casos.a1 = await crearCaso('mensual', 1);
    casos.a0 = await crearCaso('mensual', 0);
    casos.daypass = await crearCaso('daypass', 0);
    casos.set = await crearCaso('set', 2);
    casos.renovada = await crearCaso('mensual', 2);
    // Renovación pagada: empieza el día después del vencimiento ("Por iniciar").
    await prisma.membresia.create({
      data: {
        miembroId: casos.renovada.miembroId,
        planId: plan.mensual,
        nombrePlan: nombre.mensual,
        tipoPlan: TipoPlan.MENSUAL,
        precio: 30,
        tipoOperacion: TipoOperacionMembresia.RENOVACION,
        membresiaAnteriorId: casos.renovada.membresiaId,
        estado: EstadoMembresia.PAGADA,
        fechaInicioSolicitada: dia(3),
        fechaInicio: dia(3),
        fechaVencimiento: dia(32),
        registradaPorId: recepcionId,
      },
    });
  }, 60_000);

  afterAll(async () => {
    await prisma.aviso.deleteMany({ where: { miembroId: { in: miembros } } });
    await prisma.membresia.deleteMany({
      where: { miembroId: { in: miembros } },
    });
    await prisma.plan.deleteMany({ where: { id: { in: planes } } });
    await prisma.miembro.deleteMany({ where: { id: { in: miembros } } });
    await prisma.user.deleteMany({ where: { id: { in: usuarios } } });
    await app.close();
  });

  // Los casos van en orden: cada uno parte de lo que dejó el anterior.

  it('QA-V01 · avisa a 3, 1 y 0 días y al set; no a 4 días, Daypass ni renovada', async () => {
    const resultado = await tarea.avisarVencimientos(a6());

    expect(resultado).toEqual({
      dia: hoy,
      avisadas: 4,
      creados: 4,
      omitidosPorDuplicado: 0,
      fallidos: 0,
    });
    for (const caso of [casos.a3, casos.a1, casos.a0, casos.set]) {
      expect(await avisosDe(caso)).toHaveLength(1);
    }
    for (const caso of [casos.a4, casos.daypass, casos.renovada]) {
      expect(await avisosDe(caso)).toHaveLength(0);
    }
  });

  it('QA-V02 · el aviso sale del servicio de avisos con módulo MEMBRESIAS y referencia única', async () => {
    const [aviso] = await avisosDe(casos.a3);

    expect(aviso).toMatchObject({
      titulo: TITULO_VENCIMIENTO,
      moduloOrigen: ModuloOrigen.MEMBRESIAS,
      referencia: `membresia-${casos.a3.membresiaId}-vence`,
      estado: 'NO_LEIDO',
    });
  });

  it('QA-V03 · al abrirlo, el miembro ve el título y el mensaje del criterio 2', async () => {
    const token = await login(casos.a3.email);
    const [aviso] = await avisosDe(casos.a3);

    const res = await http()
      .get(`/api/v1/avisos/${aviso.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toMatchObject({
      titulo: 'Tu membresía vence pronto',
      mensaje: textoBase(nombre.mensual, sumarDias(hoy, 3)),
    });
  });

  it('QA-V04 · en un Set de clases agrega "Te quedan {n} clases por usar."', async () => {
    const [aviso] = await avisosDe(casos.set);

    expect(aviso.mensaje).toBe(
      `${textoBase(nombre.set, sumarDias(hoy, 2))} Te quedan 8 clases por usar.`,
    );
  });

  it('QA-V05 · correrla otra vez el mismo día no envía un segundo aviso', async () => {
    const resultado = await tarea.avisarVencimientos(a6());

    expect(resultado).toMatchObject({ creados: 0, omitidosPorDuplicado: 4 });
    const total = await prisma.aviso.count({
      where: { miembroId: { in: miembros } },
    });
    expect(total).toBe(4);
  });

  it('QA-V06 · si no corrió un día, al siguiente avisa a las que siguen dentro de los 3 días sin aviso', async () => {
    // No corre hoy + 1. En hoy + 2 la de 4 días ya está a 2: recibe su aviso.
    // La de 3 días y el set ya tenían el suyo; las de 1 y 0 días ya vencieron.
    const resultado = await tarea.avisarVencimientos(a6(2));

    expect(resultado).toMatchObject({
      dia: sumarDias(hoy, 2),
      creados: 1,
      omitidosPorDuplicado: 2,
      fallidos: 0,
    });
    const [aviso] = await avisosDe(casos.a4);
    expect(aviso.referencia).toBe(referenciaVencimiento(casos.a4.membresiaId));
    expect(aviso.mensaje).toBe(textoBase(nombre.mensual, sumarDias(hoy, 4)));
    expect(await avisosDe(casos.renovada)).toHaveLength(0);
    expect(await avisosDe(casos.daypass)).toHaveLength(0);
  });
});
