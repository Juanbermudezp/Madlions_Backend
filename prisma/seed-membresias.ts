/**
 * Datos iniciales de H3: un miembro de prueba por cada estado de membresía.
 *
 * Las fechas son relativas al día en que corre (hora de El Salvador) y cada
 * corrida las refresca: borra y vuelve a crear las membresías y los cobros
 * SOLO de estos miembros, para que "Próxima a vencer" no se vuelva "Vencida"
 * con el paso de los días. No toca a ningún otro usuario del seed.
 *
 * La usan prisma/seed.ts y la prueba e2e de H3 (QA-3.1).
 */
import bcrypt from 'bcrypt';
import {
  ConceptoCobro,
  EstadoMembresia,
  Rol,
  TipoOperacionMembresia,
  TipoPlan,
  type PrismaClient,
} from '../src/generated/prisma/client.js';
import { hoyLocal, sumarDias } from '../src/common/fechas/fechas.js';

const PASSWORD = 'Demo1234!';

/** Planes de prueba (se crean si no existen; el nombre es la clave). */
export const PLANES_DE_PRUEBA = {
  mensual: 'Mensual (prueba)',
  set: 'Set 8 clases (prueba)',
} as const;

export type CasoEstado =
  | 'vigente'
  | 'proxima'
  | 'porIniciar'
  | 'pendiente'
  | 'vencida'
  | 'renovacionPendiente'
  | 'renovacionPagada'
  | 'sinMembresia';

/** Correo del miembro de prueba de cada caso (contraseña Demo1234!). */
export const MIEMBROS_POR_ESTADO: Record<CasoEstado, { email: string; apellido: string; documento: string; telefono: string }> = {
  vigente: { email: 'estado.vigente@madlions.com', apellido: 'Vigente', documento: '10000001-1', telefono: '71000001' },
  proxima: { email: 'estado.proxima@madlions.com', apellido: 'Próxima a vencer', documento: '10000002-1', telefono: '71000002' },
  porIniciar: { email: 'estado.poriniciar@madlions.com', apellido: 'Por iniciar', documento: '10000003-1', telefono: '71000003' },
  pendiente: { email: 'estado.pendiente@madlions.com', apellido: 'Pendiente de pago', documento: '10000004-1', telefono: '71000004' },
  vencida: { email: 'estado.vencida@madlions.com', apellido: 'Vencida', documento: '10000005-1', telefono: '71000005' },
  renovacionPendiente: { email: 'estado.renovacion.pendiente@madlions.com', apellido: 'Renovación pendiente', documento: '10000006-1', telefono: '71000006' },
  renovacionPagada: { email: 'estado.renovacion.pagada@madlions.com', apellido: 'Renovación pagada', documento: '10000007-1', telefono: '71000007' },
  sinMembresia: { email: 'estado.sinmembresia@madlions.com', apellido: 'Sin membresía', documento: '10000008-1', telefono: '71000008' },
};

const fecha = (dia: string) => new Date(`${dia}T00:00:00Z`);

async function siguienteCodigoMiembro(prisma: PrismaClient): Promise<string> {
  const [{ siguiente }] = await prisma.$queryRaw<{ siguiente: bigint }[]>`
    SELECT nextval('miembro_codigo_seq') AS siguiente
  `;
  return `MBR-${String(siguiente).padStart(6, '0')}`;
}

/**
 * Carga (o refresca) los miembros de prueba de H3 y sus membresías.
 * @returns el id del miembro de cada caso.
 */
export async function cargarMembresiasDePrueba(
  prisma: PrismaClient,
  hoy: string = hoyLocal(),
): Promise<Record<CasoEstado, string>> {
  const recepcion = await prisma.user.findUniqueOrThrow({ where: { email: 'recepcion@madlions.com' } });
  const tiposClase = await prisma.tipoClase.findMany({ select: { id: true } });

  const plan = async (nombre: string, tipo: TipoPlan, precio: number, cantidadClases: number | null) =>
    prisma.plan.upsert({
      where: { nombre },
      update: {},
      create: {
        nombre,
        tipo,
        precio,
        cantidadClases,
        duracionDias: 30,
        beneficios: 'Plan de los datos de prueba de H3.',
        tiposClase: { create: tiposClase.map(({ id }) => ({ tipoClaseId: id })) },
      },
    });
  const mensual = await plan(PLANES_DE_PRUEBA.mensual, TipoPlan.MENSUAL, 35.5, null);
  const set = await plan(PLANES_DE_PRUEBA.set, TipoPlan.SET_CLASES, 50, 8);

  // Miembros de prueba (idempotente).
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const ids = {} as Record<CasoEstado, string>;
  for (const [caso, datos] of Object.entries(MIEMBROS_POR_ESTADO) as [CasoEstado, (typeof MIEMBROS_POR_ESTADO)[CasoEstado]][]) {
    const usuario = await prisma.user.upsert({
      where: { email: datos.email },
      update: {},
      create: {
        email: datos.email,
        passwordHash,
        nombre: 'Estado',
        apellido: datos.apellido,
        telefono: datos.telefono,
        rol: Rol.MIEMBRO,
      },
    });
    const ficha =
      (await prisma.miembro.findUnique({ where: { usuarioId: usuario.id } })) ??
      (await prisma.miembro.create({
        data: { usuarioId: usuario.id, documento: datos.documento, codigoMiembro: await siguienteCodigoMiembro(prisma) },
      }));
    ids[caso] = ficha.id;
  }

  // Se borran y recrean sus membresías y cobros, con fechas relativas a hoy.
  const miembroIds = Object.values(ids);
  await prisma.cobro.deleteMany({ where: { miembroId: { in: miembroIds } } });
  await prisma.membresia.deleteMany({ where: { miembroId: { in: miembroIds }, membresiaAnteriorId: { not: null } } });
  await prisma.membresia.deleteMany({ where: { miembroId: { in: miembroIds } } });

  const crear = async (
    caso: CasoEstado,
    p: typeof mensual,
    opciones: {
      inicio: number;
      pagada: boolean;
      operacion?: TipoOperacionMembresia;
      anteriorId?: string;
    },
  ) => {
    const inicio = sumarDias(hoy, opciones.inicio);
    const membresia = await prisma.membresia.create({
      data: {
        miembroId: ids[caso],
        planId: p.id,
        nombrePlan: p.nombre,
        tipoPlan: p.tipo,
        precio: p.precio,
        cantidadClases: p.cantidadClases,
        tipoOperacion: opciones.operacion ?? TipoOperacionMembresia.COMPRA,
        membresiaAnteriorId: opciones.anteriorId ?? null,
        estado: opciones.pagada ? EstadoMembresia.PAGADA : EstadoMembresia.PENDIENTE_PAGO,
        fechaInicioSolicitada: fecha(inicio),
        fechaInicio: opciones.pagada ? fecha(inicio) : null,
        fechaVencimiento: opciones.pagada ? fecha(sumarDias(inicio, p.duracionDias - 1)) : null,
        registradaPorId: recepcion.id,
        tiposClase: { create: tiposClase.map(({ id }) => ({ tipoClaseId: id })) },
      },
    });
    if (!opciones.pagada) {
      await prisma.cobro.create({
        data: {
          miembroId: ids[caso],
          concepto:
            membresia.tipoOperacion === TipoOperacionMembresia.RENOVACION ? ConceptoCobro.RENOVACION : ConceptoCobro.MEMBRESIA,
          monto: p.precio,
          referenciaTipo: 'MEMBRESIA',
          referenciaId: membresia.id,
        },
      });
    }
    return membresia;
  };

  // Vigente: Set de 8 clases, vence en 20 días.
  await crear('vigente', set, { inicio: -9, pagada: true });
  // Próxima a vencer: vence en 2 días.
  await crear('proxima', mensual, { inicio: -27, pagada: true });
  // Por iniciar: pagada, empieza en 4 días.
  await crear('porIniciar', mensual, { inicio: 4, pagada: true });
  // Pendiente de pago: compra sin pagar, inicio solicitado en 2 días.
  await crear('pendiente', mensual, { inicio: 2, pagada: false });
  // Vencida: venció hace 5 días.
  await crear('vencida', mensual, { inicio: -34, pagada: true });
  // Vigente (vence en 9 días) con una renovación pendiente de pago.
  const actual = await crear('renovacionPendiente', mensual, { inicio: -20, pagada: true });
  await crear('renovacionPendiente', mensual, {
    inicio: 10,
    pagada: false,
    operacion: TipoOperacionMembresia.RENOVACION,
    anteriorId: actual.id,
  });
  // Próxima a vencer (vence en 1 día) con la renovación ya pagada.
  const porVencer = await crear('renovacionPagada', mensual, { inicio: -28, pagada: true });
  await crear('renovacionPagada', mensual, {
    inicio: 2,
    pagada: true,
    operacion: TipoOperacionMembresia.RENOVACION,
    anteriorId: porVencer.id,
  });
  // Sin membresía: no se le crea ninguna.

  return ids;
}
