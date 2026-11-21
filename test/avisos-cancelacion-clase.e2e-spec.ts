/**
 * QA-25.1 · Aviso de cancelación de clase reservada (H25, Módulo 9)
 *
 * Integración real H7/H25 mediante POST /clases/:id/cancelar. El endpoint
 * guarda la auditoría DB-7.1 y llama al servicio oficial de H25 tras commit.
 * No ejecutar sin PostgreSQL QA aislado/autorizado y migraciones aplicadas.
 * La preparación de esta prueba NO implica que se haya ejecutado localmente.
 *
 * Datos: una clase con 2 reservas confirmadas (una con Set de clases), 1
 * cancelada por el miembro y un miembro sin reserva. Todo lo que crea
 * (usuarios qa25-, tipo de clase y planes [QA-25.1]) se borra al terminar.
 *
 * Requisitos: migraciones aplicadas y `npm run db:seed`.
 * Ejecutar: npm run test:e2e
 */
import { randomInt, randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { MockInstance } from 'vitest';
import { AppModule } from './../src/app.module.js';
import {
  AvisosClaseService,
  referenciaCancelacion,
  type MiembroAfectado,
} from '@Avisos/services';
import { hoyLocal, sumarDias } from '@Common/fechas';
import { PrismaService } from '@Prisma/services';
import {
  EstadoClase,
  EstadoMembresia,
  EstadoReserva,
  ModuloOrigen,
  Rol,
  TipoOperacionMembresia,
  TipoPlan,
} from '@PrismaClient';

const PREFIJO = '[QA-25.1]';
const CLAVE = 'Demo1234!';
const MOTIVO = 'Mantenimiento del aire acondicionado del salón';

type Clave = 'mensual' | 'set' | 'canceloEl' | 'sinReserva';

describe('QA-25.1 · Aviso de cancelación de clase reservada (H25)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let avisosClase: AvisosClaseService;
  let envio: MockInstance<AvisosClaseService['avisarCancelacion']>;
  let tokenAdmin: string;
  let administradorId: string;
  let canceladaPreviaEn: Date;
  const corrida = randomUUID().slice(0, 6);
  let siguiente = randomInt(100_000, 899_000);
  const hoy = hoyLocal();
  const dia = (n: number) => new Date(`${sumarDias(hoy, n)}T00:00:00.000Z`);
  // Pasado mañana de 18:00 a 19:00 en El Salvador (UTC-6).
  const fechaClase = sumarDias(hoy, 2);
  const inicio = new Date(`${sumarDias(hoy, 3)}T00:00:00.000Z`);
  const fin = new Date(`${sumarDias(hoy, 3)}T01:00:00.000Z`);
  const tipo = `${PREFIJO} Yoga ${corrida}`;
  const entrenadorNombre = `Ana QA25 ${corrida}`;

  const usuarios: string[] = [];
  const miembros: string[] = [];
  const planes: string[] = [];
  let tipoClaseId: string;
  let claseId: string;
  let passwordHash: string;
  let recepcionId: string;
  const casos = {} as Record<Clave, { miembroId: string; email: string }>;

  const http = () => request(app.getHttpServer());

  async function login(email: string): Promise<string> {
    const res = await http()
      .post('/api/v1/auth/login')
      .send({ email, password: CLAVE });
    if (res.status !== 200)
      throw new Error(`No se pudo iniciar sesión con ${email}`);
    return (res.body as { accessToken: string }).accessToken;
  }

  async function crearUsuario(rol: Rol, nombre: string, apellido: string) {
    const n = siguiente++;
    const email = `qa25-${corrida}-${n}@test.com`;
    const usuario = await prisma.user.create({
      data: {
        email,
        passwordHash,
        nombre,
        apellido,
        rol,
        telefono: String(77_000_000 + n).slice(0, 8),
      },
    });
    usuarios.push(usuario.id);
    return { id: usuario.id, email, n };
  }

  /** Miembro con una membresía PAGADA vigente del plan indicado. */
  async function crearMiembro(planId: string, tipoPlan: TipoPlan) {
    const usuario = await crearUsuario(
      Rol.MIEMBRO,
      'Prueba',
      `QA25 ${corrida}`,
    );
    const miembro = await prisma.miembro.create({
      data: {
        usuarioId: usuario.id,
        documento: `${String(usuario.n).padStart(8, '0')}-${usuario.n % 10}`,
        codigoMiembro: `MBR-${String(usuario.n).padStart(6, '0')}`,
      },
    });
    miembros.push(miembro.id);
    const membresia = await prisma.membresia.create({
      data: {
        miembroId: miembro.id,
        planId,
        nombrePlan: `${PREFIJO} ${tipoPlan}`,
        tipoPlan,
        precio: 30,
        cantidadClases: tipoPlan === TipoPlan.SET_CLASES ? 8 : null,
        tipoOperacion: TipoOperacionMembresia.COMPRA,
        estado: EstadoMembresia.PAGADA,
        fechaInicioSolicitada: dia(-5),
        fechaInicio: dia(-5),
        fechaVencimiento: dia(24),
        registradaPorId: recepcionId,
      },
    });
    return {
      miembroId: miembro.id,
      email: usuario.email,
      membresiaId: membresia.id,
    };
  }

  const avisosDe = (clave: Clave) =>
    prisma.aviso.findMany({ where: { miembroId: casos[clave].miembroId } });

  let afectados: MiembroAfectado[];

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
    avisosClase = app.get(AvisosClaseService);
    // Spy sin sustituir implementación: conserva mensajes y envío H25 reales.
    envio = vi.spyOn(avisosClase, 'avisarCancelacion');

    const recepcion = await prisma.user.findUnique({
      where: { email: 'recepcion@madlions.com' },
    });
    if (!recepcion) throw new Error('Falta el seed: corre npm run db:seed');
    recepcionId = recepcion.id;
    passwordHash = recepcion.passwordHash; // Demo1234!
    const administrador = await crearUsuario(Rol.ADMINISTRADOR, 'Admin', `QA25 ${corrida}`);
    administradorId = administrador.id;
    tokenAdmin = await login(administrador.email);

    const crearPlan = async (t: TipoPlan, cantidadClases: number | null) => {
      const { id } = await prisma.plan.create({
        data: {
          nombre: `${PREFIJO} ${t} ${corrida}`,
          tipo: t,
          precio: 30,
          duracionDias: 30,
          cantidadClases,
          beneficios: 'Prueba H25',
        },
      });
      planes.push(id);
      return id;
    };
    const planMensual = await crearPlan(TipoPlan.MENSUAL, null);
    const planSet = await crearPlan(TipoPlan.SET_CLASES, 8);

    const entrenador = await crearUsuario(
      Rol.ENTRENADOR,
      'Ana',
      `QA25 ${corrida}`,
    );
    tipoClaseId = (
      await prisma.tipoClase.create({
        data: { nombre: tipo, descripcion: 'Prueba H25' },
      })
    ).id;
    claseId = (
      await prisma.clase.create({
        data: {
          tipoClaseId,
          entrenadorId: entrenador.id,
          inicio,
          fin,
          cupoMaximo: 10,
        },
      })
    ).id;

    const mensual = await crearMiembro(planMensual, TipoPlan.MENSUAL);
    const set = await crearMiembro(planSet, TipoPlan.SET_CLASES);
    const canceloEl = await crearMiembro(planMensual, TipoPlan.MENSUAL);
    const sinReserva = await crearMiembro(planMensual, TipoPlan.MENSUAL);
    Object.assign(casos, { mensual, set, canceloEl, sinReserva });

    canceladaPreviaEn = new Date();
    await prisma.reserva.createMany({
      data: [
        {
          claseId,
          miembroId: mensual.miembroId,
          membresiaId: mensual.membresiaId,
        },
        { claseId, miembroId: set.miembroId, membresiaId: set.membresiaId },
        {
          claseId,
          miembroId: canceloEl.miembroId,
          membresiaId: canceloEl.membresiaId,
          estado: EstadoReserva.CANCELADA_MIEMBRO,
          canceladaEn: canceladaPreviaEn,
        },
      ],
    });

  }, 60_000);

  afterAll(async () => {
    envio?.mockRestore();
    if (!prisma) { if (app) await app.close(); return; }
    await prisma.aviso.deleteMany({ where: { miembroId: { in: miembros } } });
    // Si beforeAll falló, un UUID undefined no debe convertirse en DELETE global.
    if (claseId) {
      await prisma.reserva.deleteMany({ where: { claseId } });
      await prisma.clase.deleteMany({ where: { id: claseId } });
    }
    if (tipoClaseId) await prisma.tipoClase.deleteMany({ where: { id: tipoClaseId } });
    await prisma.membresia.deleteMany({
      where: { miembroId: { in: miembros } },
    });
    await prisma.plan.deleteMany({ where: { id: { in: planes } } });
    await prisma.miembro.deleteMany({ where: { id: { in: miembros } } });
    await prisma.user.deleteMany({ where: { id: { in: usuarios } } });
    await app.close();
  });

  // Los casos van en orden: cada uno parte de lo que dejó el anterior.

  it('QA-C01 · los afectados son solo las reservas "Confirmada" (con set: crédito devuelto)', async () => {
    const respuesta = await http().post(`/api/v1/clases/${claseId}/cancelar`)
      .auth(tokenAdmin, { type: 'bearer' }).send({ motivo: MOTIVO }).expect(200);
    expect(respuesta.body).toEqual({ id: claseId, estado: EstadoClase.CANCELADA_GIMNASIO, reservasCanceladas: 2 });
    expect(envio).toHaveBeenCalledTimes(1);
    expect(envio.mock.calls[0]![0]).toBe(claseId);
    expect(envio.mock.calls[0]![2]).toBe(MOTIVO);
    afectados = envio.mock.calls[0]![1]; // captura entregada por H7, no reconstruida después
    expect(afectados).toEqual(
      expect.arrayContaining([
        { miembroId: casos.mensual.miembroId, devolvioCredito: false },
        { miembroId: casos.set.miembroId, devolvioCredito: true },
      ]),
    );
    expect(afectados).toHaveLength(2);
  });

  it('QA-C02 · cada miembro con reserva confirmada recibe un aviso por el servicio de H22', async () => {
    const resultado = await envio.mock.results[0]!.value;

    expect(resultado).toEqual({
      creados: 2,
      omitidosPorDuplicado: 0,
      fallidos: 0,
    });
    for (const clave of ['mensual', 'set'] as const) {
      const [aviso, ...otros] = await avisosDe(clave);
      expect(otros).toHaveLength(0);
      expect(aviso).toMatchObject({
        titulo: `Clase cancelada: ${tipo}`,
        moduloOrigen: ModuloOrigen.CLASES,
        referencia: referenciaCancelacion(claseId),
        estado: 'NO_LEIDO',
      });
    }
  });

  it('QA-C03 · sin reserva o con la reserva cancelada por el miembro no hay aviso', async () => {
    expect(await avisosDe('canceloEl')).toHaveLength(0);
    expect(await avisosDe('sinReserva')).toHaveLength(0);
  });

  it('QA-C04 · al abrirlo, el miembro ve el título y el mensaje del criterio 2', async () => {
    const token = await login(casos.mensual.email);
    const [aviso] = await avisosDe('mensual');

    const res = await http()
      .get(`/api/v1/avisos/${aviso.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const [a, m, d] = fechaClase.split('-');
    expect(res.body).toMatchObject({
      titulo: `Clase cancelada: ${tipo}`,
      mensaje:
        `La clase de ${tipo} del ${d}/${m}/${a} de 18:00 a 19:00 con ${entrenadorNombre} ` +
        `fue cancelada por el gimnasio. Motivo: ${MOTIVO}. Tu reserva quedó cancelada.`,
    });
  });

  it('QA-C05 · con Set de clases el mensaje agrega "Tu crédito fue devuelto."', async () => {
    const [aviso] = await avisosDe('set');

    expect(aviso.mensaje).toMatch(
      /Tu reserva quedó cancelada\. Tu crédito fue devuelto\.$/,
    );
  });

  it('QA-C06 · el aviso aparece en la bandeja y suma al contador de no leídos', async () => {
    const token = await login(casos.set.email);
    const auth = { Authorization: `Bearer ${token}` };

    const conteo = await http()
      .get('/api/v1/avisos/no-leidos/conteo')
      .set(auth)
      .expect(200);
    const bandeja = await http()
      .get('/api/v1/avisos/mios')
      .set(auth)
      .expect(200);

    expect(conteo.body).toEqual({ noLeidos: 1 });
    expect(
      (bandeja.body as { items: { titulo: string }[] }).items.map(
        (i) => i.titulo,
      ),
    ).toEqual([`Clase cancelada: ${tipo}`]);
  });

  it('QA-C07 · endpoint H7 conserva auditoría DB-7.1 y la reserva cancelada por el miembro', async () => {
    const clase = await prisma.clase.findUniqueOrThrow({ where: { id: claseId } });
    expect(clase).toMatchObject({ estado: EstadoClase.CANCELADA_GIMNASIO, motivoCancelacion: MOTIVO, canceladaPorId: administradorId });
    expect(clase.canceladaEn).toBeInstanceOf(Date);
    const reservas = await prisma.reserva.findMany({ where: { claseId } });
    expect(reservas.filter(r => r.estado === EstadoReserva.CANCELADA_GIMNASIO)).toHaveLength(2);
    expect(reservas.find(r => r.miembroId === casos.canceloEl.miembroId))
      .toMatchObject({ estado: EstadoReserva.CANCELADA_MIEMBRO, canceladaEn: canceladaPreviaEn });
    await http().post(`/api/v1/clases/${claseId}/cancelar`)
      .auth(tokenAdmin, { type: 'bearer' }).send({ motivo: MOTIVO }).expect(409);
    expect(envio).toHaveBeenCalledTimes(1);
    expect(await prisma.aviso.count({ where: { miembroId: { in: miembros } } })).toBe(2);
  });

  it('QA-C08 · repetir el envío de la misma cancelación no crea avisos duplicados', async () => {
    const resultado = await avisosClase.avisarCancelacion(
      claseId,
      afectados,
      MOTIVO,
    );

    expect(resultado).toEqual({
      creados: 0,
      omitidosPorDuplicado: 2,
      fallidos: 0,
    });
    expect(
      await prisma.aviso.count({ where: { miembroId: { in: miembros } } }),
    ).toBe(2);
  });
});
