import {
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common';
import type { BloqueRepository } from '@Bloques/repositories';
import type { CobrosService } from '@Cobros/services';
import type { ConfiguracionService } from '@Configuracion/services';
import type { EstadoMembresiaService } from '@Membresias/services';
import { MENSAJES_AGENDA } from '@Sesiones/errors';
import type { DatosSesion, SesionRepository } from '@Sesiones/repositories';
import {
    ConceptoCobro,
    EstadoBloque,
    ReferenciaCobro,
    type Prisma,
} from '@PrismaClient';
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

describe('SesionesService.agendar', () => {
    const sesionRepository = {
        transaccion: vi.fn(),
        findMiembroIdDeUsuario: vi.fn(),
        bloquearMiembro: vi.fn(),
        contarPendientes: vi.fn(),
        hayTraslape: vi.fn(),
        crear: vi.fn(),
        findDeUsuario: vi.fn(),
        hayTraslapeConReserva: vi.fn(),
    };
    const bloqueRepository = { findConEntrenador: vi.fn(), ocuparSiDisponible: vi.fn() };
    const estadoMembresiaService = { obtenerEstado: vi.fn() };
    const configuracionService = { obtenerPrecioClasePuntual: vi.fn() };
    const cobrosService = { crearCobro: vi.fn() };

    const service = new SesionesService(
        sesionRepository as unknown as SesionRepository,
        bloqueRepository as unknown as BloqueRepository,
        estadoMembresiaService as unknown as EstadoMembresiaService,
        configuracionService as unknown as ConfiguracionService,
        cobrosService as unknown as CobrosService,
    );

    const rechazo = (mensaje: string) => new ConflictException(mensaje);

    beforeEach(() => {
        vi.resetAllMocks();
        // Caso válido por defecto; cada prueba cambia solo lo que necesita.
        sesionRepository.transaccion.mockImplementation((fn: (tx: Prisma.TransactionClient) => unknown) => fn(TX));
        sesionRepository.findMiembroIdDeUsuario.mockResolvedValue('m1');
        sesionRepository.contarPendientes.mockResolvedValue(0);
        sesionRepository.hayTraslape.mockResolvedValue(false);
        sesionRepository.hayTraslapeConReserva.mockResolvedValue(false);
        sesionRepository.crear.mockImplementation((datos: DatosSesion) =>
            Promise.resolve({ ...datos, precio: { toFixed: () => '10.00' } }),
        );
        bloqueRepository.findConEntrenador.mockResolvedValue(bloque);
        bloqueRepository.ocuparSiDisponible.mockResolvedValue(true);
        estadoMembresiaService.obtenerEstado.mockResolvedValue({ estado: 'VIGENTE' });
        configuracionService.obtenerPrecioClasePuntual.mockResolvedValue('10.00');
        cobrosService.crearCobro.mockResolvedValue({ id: 'c1' });
    });

    it('agenda la sesión con el cobro de sesión adicional en la misma transacción', async () => {
        const respuesta = await service.agendar('u1', 'b1', AHORA);

        expect(bloqueRepository.ocuparSiDisponible).toHaveBeenCalledWith('b1', TX);
        expect(cobrosService.crearCobro).toHaveBeenCalledWith(
            {
                miembroId: 'm1',
                concepto: ConceptoCobro.SESION_ADICIONAL,
                detalle: expect.stringContaining('Carlos Martínez') as string,
                monto: 10,
                referenciaTipo: ReferenciaCobro.SESION,
                referenciaId: expect.any(String) as string,
            },
            TX,
        );
        const { referenciaId } = cobrosService.crearCobro.mock.calls[0][0] as { referenciaId: string };
        expect(sesionRepository.crear).toHaveBeenCalledWith(
            expect.objectContaining({ id: referenciaId, miembroId: 'm1', entrenadorId: 'e1', precio: '10.00', cobroId: 'c1' }),
            TX,
        );
        expect(respuesta).toMatchObject({ id: referenciaId, entrenador: 'Carlos Martínez', precio: '10.00', cobroId: 'c1' });
    });

    it('acepta una membresía próxima a vencer que cubre la fecha', async () => {
        estadoMembresiaService.obtenerEstado.mockResolvedValue({ estado: 'PROXIMA_A_VENCER' });
        await expect(service.agendar('u1', 'b1', AHORA)).resolves.toBeDefined();
    });

    it('responde 403 si el usuario no tiene ficha de miembro', async () => {
        sesionRepository.findMiembroIdDeUsuario.mockResolvedValue(null);
        await expect(service.agendar('u1', 'b1', AHORA)).rejects.toThrow(ForbiddenException);
    });

    it('responde 404 si el bloque no existe', async () => {
        bloqueRepository.findConEntrenador.mockResolvedValue(null);
        await expect(service.agendar('u1', 'b1', AHORA)).rejects.toThrow(NotFoundException);
    });

    it('responde 409 si el bloque ya está ocupado', async () => {
        bloqueRepository.findConEntrenador.mockResolvedValue({ ...bloque, estado: EstadoBloque.OCUPADO });
        await expect(service.agendar('u1', 'b1', AHORA)).rejects.toThrow(rechazo(MENSAJES_AGENDA.NO_DISPONIBLE));
        expect(sesionRepository.transaccion).not.toHaveBeenCalled();
    });

    it('responde 409 si otro miembro lo ocupó mientras tanto, sin crear cobro', async () => {
        bloqueRepository.ocuparSiDisponible.mockResolvedValue(false);
        await expect(service.agendar('u1', 'b1', AHORA)).rejects.toThrow(rechazo(MENSAJES_AGENDA.NO_DISPONIBLE));
        expect(cobrosService.crearCobro).not.toHaveBeenCalled();
    });

    it('responde 409 si el bloque empieza en menos de 2 horas', async () => {
        const unaHoraAntes = new Date(bloque.inicio.getTime() - 60 * 60 * 1000);
        await expect(service.agendar('u1', 'b1', unaHoraAntes)).rejects.toThrow(rechazo(MENSAJES_AGENDA.ANTICIPACION));
    });

    it.each(['VENCIDA', 'SIN_MEMBRESIA', 'PENDIENTE_PAGO', 'POR_INICIAR'])(
        'responde 409 con membresía %s',
        async (estado) => {
            estadoMembresiaService.obtenerEstado.mockResolvedValue({ estado });
            await expect(service.agendar('u1', 'b1', AHORA)).rejects.toThrow(rechazo(MENSAJES_AGENDA.MEMBRESIA));
        },
    );

    it('responde 409 si la membresía está vigente hoy pero no cubre la fecha de la sesión', async () => {
        estadoMembresiaService.obtenerEstado
            .mockResolvedValueOnce({ estado: 'VIGENTE' })
            .mockResolvedValueOnce({ estado: 'VENCIDA' });
        await expect(service.agendar('u1', 'b1', AHORA)).rejects.toThrow(rechazo(MENSAJES_AGENDA.MEMBRESIA));
    });

    it('responde 409 si ya tiene 5 sesiones pendientes', async () => {
        sesionRepository.contarPendientes.mockResolvedValue(5);
        await expect(service.agendar('u1', 'b1', AHORA)).rejects.toThrow(rechazo(MENSAJES_AGENDA.LIMITE));
        expect(cobrosService.crearCobro).not.toHaveBeenCalled();
    });

    it('responde 409 si se traslapa con otra sesión', async () => {
        sesionRepository.hayTraslape.mockResolvedValue(true);
        await expect(service.agendar('u1', 'b1', AHORA)).rejects.toThrow(rechazo(MENSAJES_AGENDA.TRASLAPE_SESION));
    });

    it('responde 409 si se traslapa con una clase reservada', async () => {
        sesionRepository.hayTraslapeConReserva.mockResolvedValue(true);
        await expect(service.agendar('u1', 'b1', AHORA)).rejects.toThrow(rechazo(MENSAJES_AGENDA.TRASLAPE_CLASE));
        expect(cobrosService.crearCobro).not.toHaveBeenCalled();
    });

    it('si falla el cobro no se crea la sesión y el error sale de la transacción', async () => {
        cobrosService.crearCobro.mockRejectedValue(new Error('falló el cobro'));
        await expect(service.agendar('u1', 'b1', AHORA)).rejects.toThrow('falló el cobro');
        expect(sesionRepository.crear).not.toHaveBeenCalled();
    });
});