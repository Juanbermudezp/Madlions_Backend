// QA-18.1 · Pruebas del registro de mantenimiento y retorno a servicio (H18)

import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '@Prisma/services';
import { EstadoMaquina, TipoMaquina, ZonaMaquina } from '@PrismaClient';
import { hoyLocal, sumarDias } from '@Common/fechas';

const PREFIJO_PRUEBA = 'MAQ-7';
const CORREOS = {
  ADMINISTRADOR: 'admin@madlions.com',
  RECEPCION: 'recepcion@madlions.com',
  ENTRENADOR: 'entrenador@madlions.com',
  MIEMBRO: 'miembro@madlions.com',
} as const;
type RolPrueba = keyof typeof CORREOS;
const PUEDEN_CAMBIAR: RolPrueba[] = ['ADMINISTRADOR', 'ENTRENADOR'];
const NO_PUEDEN_CAMBIAR: RolPrueba[] = ['MIEMBRO', 'RECEPCION'];
const PASSWORD = 'Demo1234!';

const MOTIVO = 'Banda desgastada, se espera el repuesto del proveedor.';
const MOTIVO_RETORNO = 'Repuesto instalado, la máquina quedó probada.';
const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';

interface MaquinaRespuesta {
  id: string;
  codigo: string;
  estado: EstadoMaquina;
  fechaEstimadaRetorno: string | null;
  ultimoMotivo?: string | null;
  ultimoCambioPor?: { id: string; nombre: string; apellido: string } | null;
}

interface CambioRespuesta {
  id: string;
  estadoAnterior: EstadoMaquina;
  estadoNuevo: EstadoMaquina;
  motivo: string;
  fechaEstimadaRetorno: string | null;
  usuario: { id: string; nombre: string; apellido: string };
  cambiadoEn: string;
}

describe('QA-18.1 · Registro de mantenimiento y retorno a servicio (H18)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const token: Record<string, string> = {};
  let adminId: string;
  let entrenadorId: string;
  let manana: string;

  const http = () => request(app.getHttpServer());
  const como = (rol: RolPrueba) => ({ Authorization: `Bearer ${token[rol]}` });

  const cambiar = (rol: RolPrueba, id: string, cuerpo: Record<string, unknown>) =>
    http().post(`/api/v1/maquinas/${id}/estado`).set(como(rol)).send(cuerpo);

  const historial = (rol: RolPrueba, id: string) =>
    http().get(`/api/v1/maquinas/${id}/historial`).set(como(rol));

  const mensaje = (body: { message: string | string[] }) =>
    Array.isArray(body.message) ? body.message[0] : body.message;

  /** Máquina nueva para un caso, para que ninguno dependa de otro. */
  async function nuevaMaquina(
    sufijo: string,
    estado: EstadoMaquina = EstadoMaquina.OPERATIVA,
  ): Promise<{ id: string; codigo: string }> {
    const codigo = `${PREFIJO_PRUEBA}${sufijo}`;
    const maquina = await prisma.maquina.create({
      data: {
        codigo,
        nombre: `Máquina QA-18.1 ${sufijo}`,
        tipo: TipoMaquina.CARDIO,
        zona: ZonaMaquina.PISO_1,
        estado,
        ...(estado === EstadoMaquina.OPERATIVA
          ? {}
          : { fechaEstimadaRetorno: new Date(`${manana}T00:00:00Z`), ultimoMotivo: MOTIVO }),
      },
    });
    return { id: maquina.id, codigo };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    manana = sumarDias(hoyLocal(), 1);

    for (const [rol, email] of Object.entries(CORREOS)) {
      const res = await http().post('/api/v1/auth/login').send({ email, password: PASSWORD });
      if (res.status !== 200 && res.status !== 201) {
        throw new Error(`No se pudo iniciar sesión con ${email}: corre npm run db:seed`);
      }
      token[rol] = (res.body as { accessToken: string }).accessToken;
    }

    adminId = (
      await prisma.user.findUniqueOrThrow({
        where: { email: CORREOS.ADMINISTRADOR },
        select: { id: true },
      })
    ).id;
    entrenadorId = (
      await prisma.user.findUniqueOrThrow({
        where: { email: CORREOS.ENTRENADOR },
        select: { id: true },
      })
    ).id;

    await prisma.maquina.deleteMany({ where: { codigo: { startsWith: PREFIJO_PRUEBA } } });
  });

  afterAll(async () => {
    // El historial se va con la máquina (ON DELETE CASCADE).
    await prisma.maquina.deleteMany({ where: { codigo: { startsWith: PREFIJO_PRUEBA } } });
    await app.close();
  });

  describe('Criterio 1 · El administrador y el entrenador cambian el estado con motivo y fecha opcional', () => {
    it('QA-01 · el administrador pone una máquina en mantenimiento', async () => {
      const { id } = await nuevaMaquina('01');

      const res = await cambiar('ADMINISTRADOR', id, {
        estado: EstadoMaquina.EN_MANTENIMIENTO,
        motivo: MOTIVO,
        fechaEstimadaRetorno: manana,
      });

      expect(res.status).toBe(200);
      const cuerpo = res.body as MaquinaRespuesta;
      expect(cuerpo.estado).toBe(EstadoMaquina.EN_MANTENIMIENTO);
      expect(cuerpo.fechaEstimadaRetorno).toBe(manana);
      expect(cuerpo.ultimoMotivo).toBe(MOTIVO);
      expect(cuerpo.ultimoCambioPor?.id).toBe(adminId);
    });

    it('QA-02 · el entrenador también puede (supuesto S13)', async () => {
      const { id } = await nuevaMaquina('02');

      const res = await cambiar('ENTRENADOR', id, {
        estado: EstadoMaquina.FUERA_DE_SERVICIO,
        motivo: MOTIVO,
      });

      expect(res.status).toBe(200);
      expect((res.body as MaquinaRespuesta).ultimoCambioPor?.id).toBe(entrenadorId);
    });

    it('QA-03 · la fecha estimada es opcional', async () => {
      const { id } = await nuevaMaquina('03');

      const res = await cambiar('ADMINISTRADOR', id, {
        estado: EstadoMaquina.EN_MANTENIMIENTO,
        motivo: MOTIVO,
      });

      expect(res.status).toBe(200);
      expect((res.body as MaquinaRespuesta).fechaEstimadaRetorno).toBeNull();
    });

    it('QA-04 · el cambio queda guardado: el listado muestra el estado nuevo', async () => {
      const { id, codigo } = await nuevaMaquina('04');
      await cambiar('ADMINISTRADOR', id, {
        estado: EstadoMaquina.EN_MANTENIMIENTO,
        motivo: MOTIVO,
      });

      const res = await http()
        .get('/api/v1/maquinas')
        .query({ estado: EstadoMaquina.EN_MANTENIMIENTO })
        .set(como('MIEMBRO'));

      const maquinas = (res.body as { maquinas: MaquinaRespuesta[] }).maquinas;
      expect(maquinas.find((m) => m.codigo === codigo)?.estado).toBe(
        EstadoMaquina.EN_MANTENIMIENTO,
      );
    });

    it('QA-05 · el motivo es obligatorio y va de 5 a 250 caracteres', async () => {
      const { id } = await nuevaMaquina('05');
      const cambio = { estado: EstadoMaquina.EN_MANTENIMIENTO };

      for (const motivo of [undefined, 'abcd', '          ', 'a'.repeat(251)]) {
        const res = await cambiar('ADMINISTRADOR', id, { ...cambio, motivo });
        expect(res.status, `motivo ${String(motivo).slice(0, 10)}`).toBe(400);
      }

      const sinCambios = await prisma.maquina.findUniqueOrThrow({ where: { id } });
      expect(sinCambios.estado).toBe(EstadoMaquina.OPERATIVA);
    });

    it('QA-06 · 404 si la máquina no existe', async () => {
      const res = await cambiar('ADMINISTRADOR', UUID_INEXISTENTE, {
        estado: EstadoMaquina.EN_MANTENIMIENTO,
        motivo: MOTIVO,
      });

      expect(res.status).toBe(404);
      expect(mensaje(res.body as { message: string })).toBe('La máquina no existe.');
    });
  });

  describe('Criterio 2 · Al volver a "Operativa" queda la fecha y hora de retorno y se borra la estimada', () => {
    it('QA-07 · marcar como operativa borra la fecha estimada', async () => {
      const { id } = await nuevaMaquina('07', EstadoMaquina.EN_MANTENIMIENTO);

      const res = await cambiar('ADMINISTRADOR', id, {
        estado: EstadoMaquina.OPERATIVA,
        motivo: MOTIVO_RETORNO,
      });

      expect(res.status).toBe(200);
      const cuerpo = res.body as MaquinaRespuesta;
      expect(cuerpo.estado).toBe(EstadoMaquina.OPERATIVA);
      expect(cuerpo.fechaEstimadaRetorno).toBeNull();

      const enBase = await prisma.maquina.findUniqueOrThrow({ where: { id } });
      expect(enBase.fechaEstimadaRetorno).toBeNull();
    });

    it('QA-08 · la fecha y hora del retorno queda en el historial', async () => {
      const { id } = await nuevaMaquina('08', EstadoMaquina.FUERA_DE_SERVICIO);
      const antes = new Date();

      await cambiar('ENTRENADOR', id, {
        estado: EstadoMaquina.OPERATIVA,
        motivo: MOTIVO_RETORNO,
      });

      const cambios = (await historial('ADMINISTRADOR', id)).body as CambioRespuesta[];
      const retorno = cambios.find((c) => c.estadoNuevo === EstadoMaquina.OPERATIVA);

      expect(retorno).toBeDefined();
      expect(new Date(retorno!.cambiadoEn).getTime()).toBeGreaterThanOrEqual(antes.getTime());
      expect(retorno!.fechaEstimadaRetorno).toBeNull();
    });

    it('QA-09 · también vuelve a operativa desde "Fuera de servicio"', async () => {
      const { id } = await nuevaMaquina('09', EstadoMaquina.FUERA_DE_SERVICIO);

      const res = await cambiar('ADMINISTRADOR', id, {
        estado: EstadoMaquina.OPERATIVA,
        motivo: MOTIVO_RETORNO,
      });

      expect(res.status).toBe(200);
      expect((res.body as MaquinaRespuesta).estado).toBe(EstadoMaquina.OPERATIVA);
    });
  });

  describe('Criterio 3 · Cada cambio queda en el historial, del más reciente al más antiguo', () => {
    it('QA-10 · el historial trae estados, motivo, usuario y fecha y hora', async () => {
      const { id } = await nuevaMaquina('10');
      await cambiar('ADMINISTRADOR', id, {
        estado: EstadoMaquina.EN_MANTENIMIENTO,
        motivo: MOTIVO,
        fechaEstimadaRetorno: manana,
      });

      const res = await historial('ADMINISTRADOR', id);

      expect(res.status).toBe(200);
      const [cambio] = res.body as CambioRespuesta[];
      expect(cambio).toMatchObject({
        estadoAnterior: EstadoMaquina.OPERATIVA,
        estadoNuevo: EstadoMaquina.EN_MANTENIMIENTO,
        motivo: MOTIVO,
        fechaEstimadaRetorno: manana,
        usuario: { id: adminId },
      });
      expect(cambio.usuario.nombre).toBeTruthy();
      expect(Number.isNaN(new Date(cambio.cambiadoEn).getTime())).toBe(false);
    });

    it('QA-11 · tres cambios salen del más reciente al más antiguo', async () => {
      const { id } = await nuevaMaquina('11');

      await cambiar('ADMINISTRADOR', id, {
        estado: EstadoMaquina.EN_MANTENIMIENTO,
        motivo: 'Primer cambio: entra a mantenimiento.',
      });
      await cambiar('ENTRENADOR', id, {
        estado: EstadoMaquina.FUERA_DE_SERVICIO,
        motivo: 'Segundo cambio: no tiene reparación.',
      });
      await cambiar('ADMINISTRADOR', id, {
        estado: EstadoMaquina.OPERATIVA,
        motivo: 'Tercer cambio: se reemplazó el equipo.',
      });

      const cambios = (await historial('ADMINISTRADOR', id)).body as CambioRespuesta[];

      expect(cambios).toHaveLength(3);
      expect(cambios.map((c) => c.estadoNuevo)).toEqual([
        EstadoMaquina.OPERATIVA,
        EstadoMaquina.FUERA_DE_SERVICIO,
        EstadoMaquina.EN_MANTENIMIENTO,
      ]);
      const fechas = cambios.map((c) => new Date(c.cambiadoEn).getTime());
      expect(fechas[0]).toBeGreaterThanOrEqual(fechas[1]);
      expect(fechas[1]).toBeGreaterThanOrEqual(fechas[2]);
    });

    it('QA-12 · cada cambio encadena el estado anterior con el nuevo', async () => {
      const { id } = await nuevaMaquina('12');
      await cambiar('ADMINISTRADOR', id, {
        estado: EstadoMaquina.EN_MANTENIMIENTO,
        motivo: MOTIVO,
      });
      await cambiar('ADMINISTRADOR', id, {
        estado: EstadoMaquina.OPERATIVA,
        motivo: MOTIVO_RETORNO,
      });

      const cambios = (await historial('ADMINISTRADOR', id)).body as CambioRespuesta[];

      expect(cambios[0]).toMatchObject({
        estadoAnterior: EstadoMaquina.EN_MANTENIMIENTO,
        estadoNuevo: EstadoMaquina.OPERATIVA,
      });
      expect(cambios[1]).toMatchObject({
        estadoAnterior: EstadoMaquina.OPERATIVA,
        estadoNuevo: EstadoMaquina.EN_MANTENIMIENTO,
      });
    });

    it('QA-13 · una máquina que nunca cambió tiene el historial vacío', async () => {
      const { id } = await nuevaMaquina('13');

      const res = await historial('ENTRENADOR', id);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('QA-14 · 404 en el historial de una máquina que no existe', async () => {
      expect((await historial('ADMINISTRADOR', UUID_INEXISTENTE)).status).toBe(404);
    });

    it('QA-15 · un cambio rechazado no deja nada en el historial', async () => {
      const { id } = await nuevaMaquina('15');

      await cambiar('ADMINISTRADOR', id, { estado: EstadoMaquina.OPERATIVA, motivo: MOTIVO });
      await cambiar('ADMINISTRADOR', id, {
        estado: EstadoMaquina.EN_MANTENIMIENTO,
        motivo: 'abcd',
      });

      expect((await historial('ADMINISTRADOR', id)).body).toEqual([]);
    });
  });

  describe('Criterio 4 · Mismo estado, fecha pasada o fecha al volver a operativa se rechazan', () => {
    it('QA-16 · 409 al elegir el estado en el que ya está', async () => {
      const { id } = await nuevaMaquina('16');

      const res = await cambiar('ADMINISTRADOR', id, {
        estado: EstadoMaquina.OPERATIVA,
        motivo: MOTIVO,
      });

      expect(res.status).toBe(409);
      expect(mensaje(res.body as { message: string })).toBe('La máquina ya está en ese estado.');
    });

    it('QA-17 · 400 con una fecha estimada de ayer', async () => {
      const { id } = await nuevaMaquina('17');

      const res = await cambiar('ADMINISTRADOR', id, {
        estado: EstadoMaquina.EN_MANTENIMIENTO,
        motivo: MOTIVO,
        fechaEstimadaRetorno: sumarDias(hoyLocal(), -1),
      });

      expect(res.status).toBe(400);
    });

    it('QA-18 · acepta la fecha estimada de hoy', async () => {
      const { id } = await nuevaMaquina('18');

      const res = await cambiar('ADMINISTRADOR', id, {
        estado: EstadoMaquina.EN_MANTENIMIENTO,
        motivo: MOTIVO,
        fechaEstimadaRetorno: hoyLocal(),
      });

      expect(res.status).toBe(200);
      expect((res.body as MaquinaRespuesta).fechaEstimadaRetorno).toBe(hoyLocal());
    });

    it('QA-19 · 400 con fecha estimada al volver a operativa', async () => {
      const { id } = await nuevaMaquina('19', EstadoMaquina.EN_MANTENIMIENTO);

      const res = await cambiar('ADMINISTRADOR', id, {
        estado: EstadoMaquina.OPERATIVA,
        motivo: MOTIVO_RETORNO,
        fechaEstimadaRetorno: manana,
      });

      expect(res.status).toBe(400);
    });

    it('QA-20 · 400 con un estado que no existe o una fecha mal escrita', async () => {
      const { id } = await nuevaMaquina('20');

      expect(
        (await cambiar('ADMINISTRADOR', id, { estado: 'ROTA', motivo: MOTIVO })).status,
      ).toBe(400);
      expect(
        (
          await cambiar('ADMINISTRADOR', id, {
            estado: EstadoMaquina.EN_MANTENIMIENTO,
            motivo: MOTIVO,
            fechaEstimadaRetorno: '01/12/2026',
          })
        ).status,
      ).toBe(400);
    });

    it('QA-21 · tras un rechazo la máquina queda igual', async () => {
      const { id } = await nuevaMaquina('21', EstadoMaquina.EN_MANTENIMIENTO);
      const antes = await prisma.maquina.findUniqueOrThrow({ where: { id } });

      await cambiar('ADMINISTRADOR', id, {
        estado: EstadoMaquina.EN_MANTENIMIENTO,
        motivo: MOTIVO,
      });
      await cambiar('ADMINISTRADOR', id, {
        estado: EstadoMaquina.OPERATIVA,
        motivo: MOTIVO_RETORNO,
        fechaEstimadaRetorno: manana,
      });

      const despues = await prisma.maquina.findUniqueOrThrow({ where: { id } });
      expect(despues.estado).toBe(antes.estado);
      expect(despues.fechaEstimadaRetorno).toEqual(antes.fechaEstimadaRetorno);
      expect(despues.ultimoMotivo).toBe(antes.ultimoMotivo);
    });
  });

  describe('Criterio 5 · El miembro y recepción reciben "Acceso denegado"', () => {
    it('QA-22 · no pueden cambiar el estado y la máquina no cambia', async () => {
      const { id } = await nuevaMaquina('22');

      for (const rol of NO_PUEDEN_CAMBIAR) {
        const res = await cambiar(rol, id, {
          estado: EstadoMaquina.EN_MANTENIMIENTO,
          motivo: MOTIVO,
        });
        expect(res.status, `el rol ${rol} recibió ${res.status}`).toBe(403);
      }

      const sinCambios = await prisma.maquina.findUniqueOrThrow({ where: { id } });
      expect(sinCambios.estado).toBe(EstadoMaquina.OPERATIVA);
    });

    it('QA-23 · no pueden ver el historial', async () => {
      const { id } = await nuevaMaquina('23');
      await cambiar('ADMINISTRADOR', id, {
        estado: EstadoMaquina.EN_MANTENIMIENTO,
        motivo: MOTIVO,
      });

      for (const rol of NO_PUEDEN_CAMBIAR) {
        const res = await historial(rol, id);
        expect(res.status, `el rol ${rol} recibió ${res.status}`).toBe(403);
        expect(JSON.stringify(res.body)).not.toContain(MOTIVO);
      }
    });

    it('QA-24 · el administrador y el entrenador sí pueden con los dos endpoints', async () => {
      const { id } = await nuevaMaquina('24');

      for (const rol of PUEDEN_CAMBIAR) {
        const estado =
          rol === 'ADMINISTRADOR' ? EstadoMaquina.EN_MANTENIMIENTO : EstadoMaquina.OPERATIVA;
        expect((await cambiar(rol, id, { estado, motivo: MOTIVO })).status).toBe(200);
        expect((await historial(rol, id)).status).toBe(200);
      }
    });

    it('QA-25 · sin sesión no se puede ni cambiar el estado ni ver el historial', async () => {
      const { id } = await nuevaMaquina('25');

      expect(
        (
          await http()
            .post(`/api/v1/maquinas/${id}/estado`)
            .send({ estado: EstadoMaquina.EN_MANTENIMIENTO, motivo: MOTIVO })
        ).status,
      ).toBe(401);
      expect((await http().get(`/api/v1/maquinas/${id}/historial`)).status).toBe(401);
    });
  });
});
