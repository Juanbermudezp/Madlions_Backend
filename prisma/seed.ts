import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  EstadoClase,
  PrismaClient,
  Rol,
  TipoMaquina,
  ZonaMaquina,
} from '../src/generated/prisma/client.js';
import { aFechaLocal, hoyLocal, sumarDias } from '../src/common/fechas/fechas.js';
import { cargarMembresiasDePrueba } from './seed-membresias.js';

const PASSWORD = 'Demo1234!';

interface UsuarioSeed {
  email: string;
  nombre: string;
  apellido: string;
  telefono: string;
  rol: Rol;
  activo?: boolean;
  /** Solo los miembros tienen ficha, y la ficha lleva el DUI. */
  documento?: string;
}

// Un usuario por rol, un segundo entrenador (para probar que uno no toca los
// recursos del otro) y un usuario inactivo (para probar el 401 del login).
const USUARIOS: UsuarioSeed[] = [
  { email: 'demo@example.com', nombre: 'Usuario', apellido: 'Demo', telefono: '70000000', rol: Rol.MIEMBRO, documento: '00000000-0' },
  { email: 'miembro@madlions.com', nombre: 'María', apellido: 'López', telefono: '70000001', rol: Rol.MIEMBRO, documento: '01234567-8' },
  { email: 'entrenador@madlions.com', nombre: 'Carlos', apellido: 'Martínez', telefono: '70000002', rol: Rol.ENTRENADOR },
  { email: 'entrenador2@madlions.com', nombre: 'Ana', apellido: 'Hernández', telefono: '70000003', rol: Rol.ENTRENADOR },
  { email: 'recepcion@madlions.com', nombre: 'Rosa', apellido: 'Pérez', telefono: '70000004', rol: Rol.RECEPCION },
  { email: 'admin@madlions.com', nombre: 'Alberto', apellido: 'Ramírez', telefono: '70000005', rol: Rol.ADMINISTRADOR },
  { email: 'inactivo@madlions.com', nombre: 'Pedro', apellido: 'Inactivo', telefono: '70000006', rol: Rol.MIEMBRO, activo: false, documento: '02345678-9' },
];

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/** Toma el siguiente número de la secuencia y lo formatea como MBR-000001. */
async function siguienteCodigoMiembro(): Promise<string> {
  const [{ siguiente }] = await prisma.$queryRaw<{ siguiente: bigint }[]>`
    SELECT nextval('miembro_codigo_seq') AS siguiente
  `;
  return `MBR-${String(siguiente).padStart(6, '0')}`;
}

async function crearUsuarios() {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  // `upsert` hace el seed idempotente: se puede correr las veces que haga falta.
  for (const { documento, activo = true, ...datos } of USUARIOS) {
    const usuario = await prisma.user.upsert({
      where: { email: datos.email },
      update: { ...datos, isActive: activo },
      create: { ...datos, isActive: activo, passwordHash },
    });

    if (documento) {
      const ficha = await prisma.miembro.findUnique({
        where: { usuarioId: usuario.id },
      });
      if (!ficha) {
        await prisma.miembro.create({
          data: {
            usuarioId: usuario.id,
            documento,
            codigoMiembro: await siguienteCodigoMiembro(),
          },
        });
      }
    }

    const estado = activo ? '' : ' (inactivo)';
    console.log(`${datos.rol.padEnd(13)} ${datos.email} / ${PASSWORD}${estado}`);
  }
}

/** Catálogo inicial de tipos de clase (H4). Usa el nombre como clave, así que
 * correr el seed varias veces no duplica nada. Devuelve el id de cada tipo. */
async function crearTiposClase(): Promise<Record<string, string>> {
  const tipos = [
    { nombre: 'Spinning', descripcion: 'Ciclismo indoor de alta intensidad con música.' },
    { nombre: 'Yoga', descripcion: 'Posturas, respiración y flexibilidad.' },
    { nombre: 'Crossfit', descripcion: 'Entrenamiento funcional de alta intensidad.' },
  ];
  const ids: Record<string, string> = {};
  for (const tipo of tipos) {
    const { id } = await prisma.tipoClase.upsert({
      where: { nombre: tipo.nombre },
      update: {},
      create: tipo,
    });
    ids[tipo.nombre] = id;
  }
  return ids;
}

/**
 * Clases del entrenador principal para probar el traslape de H8. Se crean
 * relativas al día en que corre el seed; si ya existen no se duplican (para
 * regenerarlas: DELETE FROM clase; y volver a correr el seed).
 */
async function crearClases() {
  const entrenador = await prisma.user.findUniqueOrThrow({
    where: { email: 'entrenador@madlions.com' },
  });
  if (await prisma.clase.count({ where: { entrenadorId: entrenador.id } })) return;

  const manana = sumarDias(hoyLocal(), 1);
  const pasado = sumarDias(hoyLocal(), 2);

  const tipos = await crearTiposClase();

  await prisma.clase.createMany({
    data: [
      { tipoClaseId: tipos.Spinning, entrenadorId: entrenador.id, inicio: aFechaLocal(manana, '07:00'), fin: aFechaLocal(manana, '08:00'), cupoMaximo: 20 },
      { tipoClaseId: tipos.Yoga, entrenadorId: entrenador.id, inicio: aFechaLocal(pasado, '18:00'), fin: aFechaLocal(pasado, '19:00'), cupoMaximo: 15 },
      { tipoClaseId: tipos.Crossfit, entrenadorId: entrenador.id, inicio: aFechaLocal(manana, '10:00'), fin: aFechaLocal(manana, '11:00'), cupoMaximo: 12, estado: EstadoClase.CANCELADA_GIMNASIO },
    ],
  });
  console.log(`Clases de prueba: Spinning ${manana} 07:00, Yoga ${pasado} 18:00, Crossfit ${manana} 10:00 (cancelada)`);
}

/**
 * Inventario inicial de máquinas (H17, DB-17.1): 12 máquinas, todas
 * "Operativa". Usa el código como clave, así que correr el seed varias veces
 * no duplica nada y tampoco pisa el estado que H18 haya registrado: `update`
 * va vacío a propósito.
 */
async function crearMaquinas() {
  const maquinas = [
    { codigo: 'MAQ-001', nombre: 'Caminadora 1', tipo: TipoMaquina.CARDIO, zona: ZonaMaquina.PISO_1 },
    { codigo: 'MAQ-002', nombre: 'Caminadora 2', tipo: TipoMaquina.CARDIO, zona: ZonaMaquina.PISO_1 },
    { codigo: 'MAQ-003', nombre: 'Elíptica', tipo: TipoMaquina.CARDIO, zona: ZonaMaquina.PISO_1 },
    { codigo: 'MAQ-004', nombre: 'Bicicleta estática', tipo: TipoMaquina.CARDIO, zona: ZonaMaquina.PISO_1 },
    { codigo: 'MAQ-005', nombre: 'Remo', tipo: TipoMaquina.CARDIO, zona: ZonaMaquina.AREA_FUNCIONAL },
    { codigo: 'MAQ-006', nombre: 'Prensa de piernas', tipo: TipoMaquina.FUERZA, zona: ZonaMaquina.PISO_2 },
    { codigo: 'MAQ-007', nombre: 'Jalón al pecho', tipo: TipoMaquina.FUERZA, zona: ZonaMaquina.PISO_2 },
    { codigo: 'MAQ-008', nombre: 'Extensión de cuádriceps', tipo: TipoMaquina.FUERZA, zona: ZonaMaquina.PISO_2 },
    { codigo: 'MAQ-009', nombre: 'Banco de press plano', tipo: TipoMaquina.PESO_LIBRE, zona: ZonaMaquina.PISO_2 },
    { codigo: 'MAQ-010', nombre: 'Rack de sentadillas', tipo: TipoMaquina.PESO_LIBRE, zona: ZonaMaquina.PISO_2 },
    { codigo: 'MAQ-011', nombre: 'Estación de kettlebells', tipo: TipoMaquina.FUNCIONAL, zona: ZonaMaquina.AREA_FUNCIONAL },
    { codigo: 'MAQ-012', nombre: 'Estación de TRX', tipo: TipoMaquina.FUNCIONAL, zona: ZonaMaquina.AREA_FUNCIONAL },
  ];

  for (const maquina of maquinas) {
    await prisma.maquina.upsert({
      where: { codigo: maquina.codigo },
      update: {},
      create: maquina,
    });
  }
  console.log(`Inventario de máquinas: ${maquinas.length} máquinas operativas`);
}

try {
  await crearUsuarios();
  await crearClases();
  await cargarMembresiasDePrueba(prisma);
  console.log('Miembros de prueba de H3 (uno por estado de membresía): estado.*@madlions.com / Demo1234!');
  await crearMaquinas();
} finally {
  await prisma.$disconnect();
}