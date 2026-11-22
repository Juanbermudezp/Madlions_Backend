import { ConflictException } from '@nestjs/common';
import type { BloqueRepository } from '@Bloques/repositories';
import type { CobrosService } from '@Cobros/services';
import type { ConfiguracionService } from '@Configuracion/services';
import { EntrenadoresService } from '@Entrenadores/services';
import type { EstadoMembresiaService } from '@Membresias/services';
import type { DatosSesion, SesionRepository } from '@Sesiones/repositories';
import { SesionesController } from '@Sesiones/controllers';
import type { UserRepository } from '@Users/repositories';
import { ConceptoCobro, EstadoBloque, EstadoSesion, ReferenciaCobro, type Prisma } from '@PrismaClient';
import { SesionesService } from './sesiones.service.js';

const AHORA = new Date('2026-11-16T15:00:00Z'); // lunes 09:00 en El Salvador
const TX = {} as Prisma.TransactionClient;

const bloque = {
    id: 'b1',
    entrenadorId: 'e1',
    inicio: new Date('2026-11-17T13:00:00Z'), // martes 07:00
    fin: new Date('2026-11-17T14:00:00Z'),
    duracionMin: 60,
    estado: EstadoBloque.DISPONIBLE,
    creadoEn: AHORA,
    entrenador: { nombre: 'Carlos', apellido: 'Martínez' },
};

describe('H9. Agendar sesión con un entrenador', () => {
    const sesionRepository = {
        transaccion: vi.fn(), findMiembroIdDeUsuario: vi.fn(), bloquearMiembro: vi.fn(), contarPendientes: vi.fn(),
        hayTraslape: vi.fn(), hayTraslapeConReserva: vi.fn(), crear: vi.fn(), findDeUsuario: vi.fn(),
    };
    const bloqueRepository = { findConEntrenador: vi.fn(), ocuparSiDisponible: vi.fn(), findDisponiblesDelEntrenadorEntre: vi.fn() };
    const estadoMembresia = { obtenerEstado: vi.fn() };
    const configuracion = { obtenerPrecioClasePuntual: vi.fn() };
    const cobros = { crearCobro: vi.fn() };
    const service = new SesionesService(
        sesionRepository as unknown as SesionRepository,
        bloqueRepository as unknown as BloqueRepository,
        estadoMembresia as unknown as EstadoMembresiaService,
        configuracion as unknown as ConfiguracionService,
        cobros as unknown as CobrosService,
    );

    beforeEach(() => {
        vi.resetAllMocks();
        sesionRepository.transaccion.mockImplementation((fn: (tx: Prisma.TransactionClient) => unknown) => fn(TX));
        sesionRepository.findMiembroIdDeUsuario.mockResolvedValue('m1');
        sesionRepository.contarPendientes.mockResolvedValue(0);
        sesionRepository.hayTraslape.mockResolvedValue(false);
        sesionRepository.hayTraslapeConReserva.mockResolvedValue(false);
        sesionRepository.crear.mockImplementation((datos: DatosSesion) => Promise.resolve({ ...datos, precio: { toFixed: () => '10.00' } }));
        bloqueRepository.findConEntrenador.mockResolvedValue(bloque);
        bloqueRepository.ocuparSiDisponible.mockResolvedValue(true);
        estadoMembresia.obtenerEstado.mockResolvedValue({ estado: 'VIGENTE' });
        configuracion.obtenerPrecioClasePuntual.mockResolvedValue('10.00');
        cobros.crearCobro.mockResolvedValue({ id: 'c1' });
    });

    it('AC1: lista los entrenadores y sus bloques disponibles de los próximos 14 días que empiezan en 2 horas o más', async () => {
        const users = { findEntrenadoresActivos: vi.fn().mockResolvedValue([{ id: 'e1', nombre: 'Carlos', apellido: 'Martínez' }]), findEntrenadorActivoById: vi.fn().mockResolvedValue({ id: 'e1' }) };
        const entrenadores = new EntrenadoresService(users as unknown as UserRepository, bloqueRepository as unknown as BloqueRepository, configuracion as unknown as ConfiguracionService);
        bloqueRepository.findDisponiblesDelEntrenadorEntre.mockResolvedValue([]);

        await expect(entrenadores.listar()).resolves.toHaveLength(1);
        await entrenadores.listarBloquesDisponibles('e1', AHORA);
        expect(bloqueRepository.findDisponiblesDelEntrenadorEntre).toHaveBeenCalledWith(
            'e1',
            new Date('2026-11-16T17:00:00Z'), // ahora + 2 horas
            new Date('2026-11-30T15:00:00Z'), // ahora + 14 días
        );
    });

    it('AC2: el resumen incluye el precio de la clase puntual junto a los bloques', async () => {
        const users = { findEntrenadorActivoById: vi.fn().mockResolvedValue({ id: 'e1' }) };
        const entrenadores = new EntrenadoresService(users as unknown as UserRepository, bloqueRepository as unknown as BloqueRepository, configuracion as unknown as ConfiguracionService);
        bloqueRepository.findDisponiblesDelEntrenadorEntre.mockResolvedValue([]);

        await expect(entrenadores.listarBloquesDisponibles('e1', AHORA)).resolves.toMatchObject({ precioClasePuntual: '10.00' });
    });

    it('AC3: al confirmar la sesión queda agendada y el bloque pasa a ocupado', async () => {
        const res = await service.agendar('u1', 'b1', AHORA);

        expect(bloqueRepository.ocuparSiDisponible).toHaveBeenCalledWith('b1', TX);
        expect(sesionRepository.crear).toHaveBeenCalledWith(
            expect.objectContaining({ bloqueId: 'b1', miembroId: 'm1', entrenadorId: 'e1', inicio: bloque.inicio, fin: bloque.fin }),
            TX,
        );
        expect(res).toMatchObject({ entrenador: 'Carlos Martínez', precio: '10.00', cobroId: 'c1' });
    });

    it('AC4: genera un cobro "Sesión adicional" por el precio vigente de la clase puntual', async () => {
        configuracion.obtenerPrecioClasePuntual.mockResolvedValue('12.50');
        await service.agendar('u1', 'b1', AHORA);

        expect(cobros.crearCobro).toHaveBeenCalledWith(
            expect.objectContaining({ miembroId: 'm1', concepto: ConceptoCobro.SESION_ADICIONAL, monto: 12.5, referenciaTipo: ReferenciaCobro.SESION }),
            TX,
        );
    });

    it('AC5: un bloque que empieza en menos de 2 horas se rechaza', async () => {
        bloqueRepository.findConEntrenador.mockResolvedValue({ ...bloque, inicio: new Date('2026-11-16T16:59:00Z') });

        await expect(service.agendar('u1', 'b1', AHORA)).rejects.toThrow(
            new ConflictException('Solo puedes agendar con al menos 2 horas de anticipación'),
        );
        expect(sesionRepository.transaccion).not.toHaveBeenCalled();
    });

    it('AC6: rechaza con 5 sesiones pendientes o si se traslapa con una clase reservada u otra sesión', async () => {
        sesionRepository.contarPendientes.mockResolvedValueOnce(5);
        await expect(service.agendar('u1', 'b1', AHORA)).rejects.toThrow('Ya tienes 5 sesiones agendadas que no han empezado');

        sesionRepository.hayTraslapeConReserva.mockResolvedValueOnce(true);
        await expect(service.agendar('u1', 'b1', AHORA)).rejects.toThrow('Ya tienes una clase reservada en ese horario');

        sesionRepository.hayTraslape.mockResolvedValueOnce(true);
        await expect(service.agendar('u1', 'b1', AHORA)).rejects.toThrow('Ya tienes otra sesión agendada en ese horario');

        expect(sesionRepository.crear).not.toHaveBeenCalled();
    });

    it('AC7: si dos miembros confirman el mismo bloque solo uno lo obtiene y el otro ve "Este horario ya no está disponible"', async () => {
        bloqueRepository.ocuparSiDisponible.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

        await expect(service.agendar('u1', 'b1', AHORA)).resolves.toBeDefined();
        await expect(service.agendar('u2', 'b1', AHORA)).rejects.toThrow(new ConflictException('Este horario ya no está disponible'));
        expect(sesionRepository.crear).toHaveBeenCalledTimes(1);
    });

    it('AC8: sin membresía vigente o que no cubra la fecha de la sesión se rechaza', async () => {
        estadoMembresia.obtenerEstado.mockResolvedValueOnce({ estado: 'VIGENTE' }).mockResolvedValueOnce({ estado: 'VENCIDA' });
        await expect(service.agendar('u1', 'b1', AHORA)).rejects.toThrow('Necesitas una membresía vigente para agendar');

        estadoMembresia.obtenerEstado.mockResolvedValue({ estado: 'PENDIENTE_PAGO' });
        await expect(service.agendar('u1', 'b1', AHORA)).rejects.toThrow('Necesitas una membresía vigente para agendar');
        expect(estadoMembresia.obtenerEstado).toHaveBeenCalledWith('m1', '2026-11-17');
    });

    it('AC9: una sesión agendada no tiene opción para cancelarse', () => {
        const metodos = Object.getOwnPropertyNames(SesionesController.prototype);
        expect(metodos.filter((m) => /cancel/i.test(m))).toEqual([]);
        expect(Object.values(EstadoSesion)).toEqual(['AGENDADA']);
    });
});
