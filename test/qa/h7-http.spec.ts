import { Test } from '@nestjs/testing';
import { Logger, ValidationPipe, type INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { JwtAuthGuard, RolesGuard } from '@Auth/guards';
import type { UsersService } from '@Users/services';
import { PrismaModule } from '@Prisma';
import { PrismaService } from '@Prisma/services';
import { EstadoClase, EstadoMembresia, EstadoReserva, Rol, TipoPlan } from '@PrismaClient';
import { calcularEstadoMembresia } from '@Membresias/services';
import { CancelacionClasesModule } from '../../src/clases/cancelacion-clases.module.js';
import { AvisosClaseService } from '@Avisos/services';
import { AHORA_H7, capturaH7, claseH7, idH7, MOTIVO_H7, reservasH7 } from './h7-fixtures.js';

type AvisoQA = { miembroId: string; referencia: string; titulo: string; mensaje: string; moduloOrigen: string };
type EstadoQA = { clase: ReturnType<typeof claseH7> | null; reservas: ReturnType<typeof reservasH7>; avisos: AvisoQA[] };
/** HTTP real: módulos H7/H4/H22/H23/H25 y DI/controlador/servicio/repositorio/guards.
 * Prisma, verificación JWT y catálogo de usuarios simulados. El mutex y las
 * copias simulan serialización/rollback: NO demuestran locks reales PostgreSQL.
 */
describe('H7 + BE-25.1 HTTP (Prisma simulado)', () => {
    let app: INestApplication;
    let estado: EstadoQA;
    let cola: Promise<unknown> = Promise.resolve();
    let falloReservas: boolean; let falloAvisos: boolean; let falloCommit: boolean; let miembroCancelaAntes: boolean; let falloLecturaH25: boolean;
    let eventos: string[];
    let errores: unknown[];
    const prisma = { $transaction: vi.fn(), clase: { findUnique: vi.fn() } };
    const roles = new Map([['admin', Rol.ADMINISTRADOR], ['miembro', Rol.MIEMBRO], ['entrenador', Rol.ENTRENADOR], ['recepcion', Rol.RECEPCION]]);
    beforeAll(async () => {
        const modulo = await Test.createTestingModule({ imports: [PrismaModule, CancelacionClasesModule] })
            .overrideProvider(PrismaService).useValue(prisma).compile();
        app = modulo.createNestApplication({ logger: false }); app.setGlobalPrefix('api/v1');
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
        const jwt = { verifyAsync: vi.fn(async (token: string) => { if (!roles.has(token)) throw new Error('inválido'); return { sub: token }; }) };
        const users = { findById: vi.fn(async (token: string) => roles.has(token) ? { id: idH7(token === 'admin' ? 1 : 2), rol: roles.get(token), isActive: true } : null) };
        const reflector = modulo.get(Reflector);
        app.useGlobalGuards(new JwtAuthGuard(reflector, jwt as unknown as JwtService, users as unknown as UsersService), new RolesGuard(reflector));
        await app.init();
    }, 15000);
    afterAll(async () => { if (app) await app.close(); });
    beforeEach(() => {
        vi.resetAllMocks(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(AHORA_H7);
        errores = [];
        vi.spyOn(Logger.prototype, 'error').mockImplementation((mensaje: unknown) => { errores.push(mensaje); });
        vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        estado = { clase: claseH7(), reservas: reservasH7(), avisos: [] };
        eventos = []; falloReservas = false; falloAvisos = false; falloCommit = false; miembroCancelaAntes = false; falloLecturaH25 = false; cola = Promise.resolve();
        prisma.clase.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
            expect(eventos).toContain('commit');
            eventos.push('lectura-h25');
            if (falloLecturaH25) throw new Error('lectura de clase H25 falló');
            return estado.clase?.id === where.id ? structuredClone(estado.clase) : null;
        });
        prisma.$transaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) => {
            const tarea = cola.then(async () => {
                const copia = structuredClone(estado); let cancelo = false;
                const tx = {
                    clase: {
                        updateMany: vi.fn(async ({ where, data }: { where: { id: string; estado: string; inicio: { gt: Date } }; data: object }) => {
                            const c = copia.clase;
                            if (!c || c.id !== where.id || c.estado !== where.estado || c.inicio <= where.inicio.gt) return { count: 0 };
                            Object.assign(c, data); cancelo = true; eventos.push('clase'); return { count: 1 };
                        }),
                        findUnique: vi.fn(async () => copia.clase),
                        findUniqueOrThrow: vi.fn(async () => { if (!copia.clase) throw new Error('No clase'); return copia.clase; }),
                    },
                    $queryRaw: vi.fn(async (sql: TemplateStringsArray, ahora: Date, claseId: string) => {
                        expect(sql.join('?')).toContain("r.estado = 'CONFIRMADA'");
                        if (falloReservas) throw new Error('reservas falló');
                        if (miembroCancelaAntes) {
                            // Simula que H6 ganó el UPDATE de una reserva antes
                            // del UPDATE H7. No es una prueba de locks PostgreSQL.
                            copia.reservas[0]!.estado = EstadoReserva.CANCELADA_MIEMBRO;
                            copia.reservas[0]!.canceladaEn = AHORA_H7;
                        }
                        eventos.push('reservas');
                        return copia.reservas.filter(r => r.claseId === claseId && r.estado === EstadoReserva.CONFIRMADA).map(r => {
                            r.estado = EstadoReserva.CANCELADA_GIMNASIO; r.canceladaEn = ahora;
                            return { reservaId: r.id, miembroId: r.miembroId, creditoDevuelto: r.tipoPlan === TipoPlan.SET_CLASES };
                        });
                    }),
                    miembro: { findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.map(id => ({ id }))) },
                    aviso: { createMany: vi.fn(async ({ data, skipDuplicates }: { data: AvisoQA[]; skipDuplicates: boolean }) => {
                        eventos.push('avisos'); expect(estado.clase!.estado).toBe(EstadoClase.CANCELADA_GIMNASIO);
                        expect(eventos).toContain('commit'); expect(skipDuplicates).toBe(true);
                        if (falloAvisos) throw new Error('avisos falló');
                        let count = 0;
                        for (const a of data) {
                            if (!copia.avisos.some(b => b.miembroId === a.miembroId && b.referencia === a.referencia)) { copia.avisos.push(a); count++; }
                        }
                        return { count };
                    }) },
                };
                const res = await fn(tx);
                if (cancelo && falloCommit) throw new Error('commit falló');
                estado = copia; eventos.push(cancelo ? 'commit' : 'commit-aviso'); return res;
            });
            cola = tarea.catch(() => undefined); return tarea;
        });
    });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
    const api = (id = idH7(10)) => request(app.getHttpServer()).post(`/api/v1/clases/${id}/cancelar`);
    const cancelar = () => api().auth('admin', { type: 'bearer' }).send({ motivo: MOTIVO_H7 });

    it('200exacto,3confirmadas cambian,previa del miembro intacta,auditoría y3avisos después de commit', async () => {
        const notificar = vi.spyOn(app.get(AvisosClaseService), 'avisarCancelacion');
        const previa = structuredClone(estado.reservas[3]);
        expect((await cancelar().expect(200)).body).toEqual({ id: idH7(10), estado: 'CANCELADA_GIMNASIO', reservasCanceladas: 3 });
        expect(estado.clase).toMatchObject({ estado: 'CANCELADA_GIMNASIO', motivoCancelacion: MOTIVO_H7, canceladaPorId: idH7(1), canceladaEn: AHORA_H7 });
        expect(estado.reservas[3]).toEqual(previa);
        expect(estado.reservas.slice(0, 3).every(r => r.estado === EstadoReserva.CANCELADA_GIMNASIO && r.canceladaEn!.getTime() === AHORA_H7.getTime())).toBe(true);
        expect(estado.avisos).toHaveLength(3); expect(estado.avisos.some(a => a.miembroId === idH7(24))).toBe(false);
        expect(eventos.indexOf('commit')).toBeLessThan(eventos.indexOf('avisos'));
        expect(eventos.indexOf('commit')).toBeLessThan(eventos.indexOf('lectura-h25'));
        expect(notificar).toHaveBeenCalledExactlyOnceWith(idH7(10), [
            { miembroId: idH7(21), devolvioCredito: true },
            { miembroId: idH7(22), devolvioCredito: false },
            { miembroId: idH7(23), devolvioCredito: true },
        ], MOTIVO_H7);
    });
    it('SETlibera por conteo;MENSUALsin devolución y sin avisar doble', async () => {
        const usadas = (membresiaId: string) => estado.reservas.filter(r => r.membresiaId === membresiaId && r.estado === EstadoReserva.CONFIRMADA).length;
        const creditos = (membresiaId: string, tipoPlan: TipoPlan) => calcularEstadoMembresia([{
            id: membresiaId, tipoPlan, nombrePlan: 'Plan histórico', estado: EstadoMembresia.PAGADA,
            cantidadClases: tipoPlan === TipoPlan.SET_CLASES ? 2 : null,
            fechaInicioSolicitada: new Date('2026-11-01T00:00:00Z'), fechaInicio: new Date('2026-11-01T00:00:00Z'),
            fechaVencimiento: new Date('2026-11-30T00:00:00Z'), tiposClaseIds: [idH7(500)],
        }], '2026-11-20', new Map([[membresiaId, usadas(membresiaId)]])).creditosDisponibles;
        expect(usadas(idH7(41))).toBe(1);
        expect(creditos(idH7(41), TipoPlan.SET_CLASES)).toBe(1);
        expect(creditos(idH7(42), TipoPlan.MENSUAL)).toBeNull();
        await cancelar().expect(200);
        expect(usadas(idH7(41))).toBe(0); // el mismo conteo que usa H2, sin incrementar campos
        expect(creditos(idH7(41), TipoPlan.SET_CLASES)).toBe(2);
        expect(creditos(idH7(42), TipoPlan.MENSUAL)).toBeNull();
        for (const id of [21, 23]) expect(estado.avisos.find(a => a.miembroId === idH7(id))!.mensaje).toContain('Tu crédito fue devuelto.');
        expect(estado.avisos.find(a => a.miembroId === idH7(22))!.mensaje).not.toContain('Tu crédito fue devuelto.');
        expect(estado.avisos[0]).toMatchObject({ titulo: 'Clase cancelada: Yoga', moduloOrigen: 'CLASES', referencia: `clase-${idH7(10)}-cancelada` });
        expect(estado.avisos.find(a => a.miembroId === idH7(22))!.mensaje).toBe(
            `La clase de Yoga del 20/11/2026 de 19:00 a 20:00 con Carlos Martínez fue cancelada por el gimnasio. Motivo: ${MOTIVO_H7}. Tu reserva quedó cancelada.`,
        );
    });
    it('clase sin reservas cancela200con0 y sin llamadas H22', async () => {
        estado.reservas = [];
        expect((await cancelar().expect(200)).body.reservasCanceladas).toBe(0); expect(estado.avisos).toEqual([]);
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
    it('404clase inexistente', async () => {
        estado.clase = null; await cancelar().expect(404); expect(estado.avisos).toEqual([]);
    });
    it.each([0, -1000, -86400000])('409si comenzó/terminó,offset%s', async (delta) => {
        estado.clase!.inicio = new Date(AHORA_H7.getTime() + delta); await cancelar().expect(409);
        expect(estado.clase!.estado).toBe(EstadoClase.PROGRAMADA); expect(estado.avisos).toEqual([]);
    });
    it('reintentarPOST409no vuelve a liberar ni enviar', async () => {
        await cancelar().expect(200); const copia = structuredClone(estado); await cancelar().expect(409); expect(estado).toEqual(copia);
    });
    it('2cancelaciones simultáneas:una200otra409,3reservas y3avisos únicos (serialización simulada)', async () => {
        const notificar = vi.spyOn(app.get(AvisosClaseService), 'avisarCancelacion');
        const respuestas = await Promise.all([cancelar(), cancelar()]);
        expect(respuestas.map(r => r.status).sort((a, b) => a - b)).toEqual([200, 409]);
        expect(estado.reservas.filter(r => r.estado === EstadoReserva.CANCELADA_GIMNASIO)).toHaveLength(3);
        expect(estado.avisos).toHaveLength(3); expect(eventos.filter(e => e === 'clase')).toHaveLength(1);
        expect(notificar).toHaveBeenCalledTimes(1);
    });
    it('reserva de otra clase permaneceCONFIRMADA y no recibe aviso', async () => {
        estado.reservas.push({ ...estado.reservas[0]!, id: idH7(999), claseId: idH7(11), miembroId: idH7(99) });
        await cancelar().expect(200); expect(estado.reservas[4]!.estado).toBe(EstadoReserva.CONFIRMADA);
        expect(estado.avisos.some(a => a.miembroId === idH7(99))).toBe(false);
    });
    it('si H6 ganó una reserva,cuenta2y no notifica al miembro que la canceló (intercalado simulado)', async () => {
        const notificar = vi.spyOn(app.get(AvisosClaseService), 'avisarCancelacion');
        miembroCancelaAntes = true;
        expect((await cancelar().expect(200)).body.reservasCanceladas).toBe(2);
        expect(estado.reservas[0]!.estado).toBe(EstadoReserva.CANCELADA_MIEMBRO);
        expect(estado.avisos).toHaveLength(2); expect(estado.avisos.some(a => a.miembroId === idH7(21))).toBe(false);
        expect(notificar).toHaveBeenCalledExactlyOnceWith(idH7(10), [
            { miembroId: idH7(22), devolvioCredito: false },
            { miembroId: idH7(23), devolvioCredito: true },
        ], MOTIVO_H7);
    });
    it.each([10, 250])('motivo%s aceptado', async (n) => { await api().auth('admin', { type: 'bearer' }).send({ motivo: 'a'.repeat(n) }).expect(200); });
    it.each([9, 251])('motivo%s rechazado400', async (n) => {
        await api().auth('admin', { type: 'bearer' }).send({ motivo: 'a'.repeat(n) }).expect(400); expect(prisma.$transaction).not.toHaveBeenCalled();
    });
    it('trim del motivo y actor exclusivo del token', async () => {
        await api().auth('admin', { type: 'bearer' }).send({ motivo: `  ${MOTIVO_H7}  ` }).expect(200);
        expect(estado.clase).toMatchObject({ motivoCancelacion: MOTIVO_H7, canceladaPorId: idH7(1) });
    });
    it.each([{}, { motivo: null }, { motivo: 123 }, { motivo: ' '.repeat(20) }, { motivo: MOTIVO_H7, canceladaPorId: idH7(3) }])('400cuerpo%j', async (body) => {
        await api().auth('admin', { type: 'bearer' }).send(body).expect(400); expect(prisma.$transaction).not.toHaveBeenCalled();
    });
    it('400UUID inválido', async () => {
        await api('123').auth('admin', { type: 'bearer' }).send({ motivo: MOTIVO_H7 }).expect(400); expect(prisma.$transaction).not.toHaveBeenCalled();
    });
    it.each(['miembro', 'entrenador', 'recepcion'])('403rol%s antes de consultar', async (rol) => {
        await api().auth(rol, { type: 'bearer' }).send({ motivo: MOTIVO_H7 }).expect(403); expect(prisma.$transaction).not.toHaveBeenCalled();
    });
    it('401sin token o token inválido', async () => {
        await api().send({ motivo: MOTIVO_H7 }).expect(401);
        await api().auth('invalido', { type: 'bearer' }).send({ motivo: MOTIVO_H7 }).expect(401); expect(prisma.$transaction).not.toHaveBeenCalled();
    });
    it.each(['reservas', 'commit'])('fallo%s simula rollback y no envía avisos', async (fallo) => {
        falloReservas = fallo === 'reservas'; falloCommit = fallo === 'commit'; const anterior = structuredClone(estado);
        await cancelar().expect(500); expect(estado).toEqual(anterior); expect(eventos).not.toContain('avisos');
    });
    it('fallo de avisos no revierte commit ni cambia200 y prueba ambos grupos', async () => {
        falloAvisos = true; await cancelar().expect(200);
        expect(estado.clase!.estado).toBe(EstadoClase.CANCELADA_GIMNASIO);
        expect(estado.reservas.filter(r => r.estado === EstadoReserva.CANCELADA_GIMNASIO)).toHaveLength(3);
        expect(errores).toHaveLength(2); expect(eventos.filter(e => e === 'avisos')).toHaveLength(2);
    });
    it('excepción de H25 al leer la clase no transforma el commit en HTTP500', async () => {
        falloLecturaH25 = true;
        expect((await cancelar().expect(200)).body).toEqual({ id: idH7(10), estado: 'CANCELADA_GIMNASIO', reservasCanceladas: 3 });
        expect(estado.clase!.estado).toBe(EstadoClase.CANCELADA_GIMNASIO);
        expect(estado.reservas.filter(r => r.estado === EstadoReserva.CANCELADA_GIMNASIO)).toHaveLength(3);
        expect(errores).toHaveLength(1); expect(eventos).not.toContain('avisos');
    });
    it('reintento interno con la captura no duplica por H22 real/Prisma simulado', async () => {
        await cancelar().expect(200);
        await app.get(AvisosClaseService).avisarCancelacion(idH7(10), capturaH7().reservas.map((r) => ({ miembroId: r.miembroId, devolvioCredito: r.creditoDevuelto })), MOTIVO_H7);
        expect(estado.avisos).toHaveLength(3);
    });
});
