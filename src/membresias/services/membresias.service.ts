import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
    type OnModuleInit,
} from '@nestjs/common';
import { CobrosService } from '@Cobros/services';
import { MembresiaRepository } from '@Membresias/repositories';
import { assertOwnership } from '@Common/ownership';
import { hoyLocal } from '@Common/fechas';
import { EstadoMembresia, ReferenciaCobro, type Membresia, type Prisma } from '@PrismaClient';
import { calcularCobertura } from './reglas-cobertura.js';
import { EstadoMembresiaService } from './estado-membresia.service.js';
import { SIN_MEMBRESIA, type EstadoMembresiaDetalle } from './reglas-estado.js';
import type { MembresiaDetalleResponseDto } from '@Membresias/dto';

export const MEMBRESIA_NO_EXISTE = 'La membresía no existe.';
export const MEMBRESIA_PAGADA_CON_OTRO_PAGO = 'La membresía ya fue pagada con otro pago.';
export const REFERENCIA_PAGO_INVALIDA = 'La referencia del pago es obligatoria y puede tener hasta 100 caracteres.';
export const REFERENCIA_PAGO_EN_USO = 'La referencia del pago ya se aplicó a otra membresía.';
export const MEMBRESIA_DE_OTRO_MIEMBRO = 'No tienes permiso para ver esta membresía.';

export interface ResultadoAplicarPago {
    /** false si la misma confirmación ya se había aplicado (no hizo nada). */
    aplicado: boolean;
    membresia: Membresia;
}

/** Operaciones sobre membresías que piden otros módulos (H2). */
@Injectable()
export class MembresiasService implements OnModuleInit {
    constructor(
        private readonly membresiaRepository: MembresiaRepository,
        private readonly estadoMembresiaService: EstadoMembresiaService,
        private readonly cobrosService: CobrosService,
    ) { }

    /**
     * H12 · Cuando el Módulo 5 confirma el pago de un cobro de membresía, la
     * activa o renueva con aplicarPago(), dentro de la misma transacción del
     * pago: si algo falla, no queda ni el cobro pagado ni la membresía activa.
     */
    onModuleInit(): void {
        this.cobrosService.registrarConfirmacion(ReferenciaCobro.MEMBRESIA, async (pago, tx) => {
            await this.aplicarPago(pago.referenciaId, pago.referenciaPago, pago.fechaPago, tx);
        });
    }

    /**
     * BE-2.4 · Estado de la membresía de un miembro para los módulos 2, 3, 4 y
     * 9. `fecha` en AAAA-MM-DD, hora de El Salvador (por defecto, hoy).
     */
    obtenerEstado(miembroId: string, fecha: string = hoyLocal()): Promise<EstadoMembresiaDetalle> {
        return this.estadoMembresiaService.obtenerEstado(miembroId, fecha);
    }

    /**
     * H3 · Estado de la membresía del usuario autenticado. El miembro sale del
     * token (`usuarioId`), nunca de un parámetro. Si el usuario no tiene ficha
     * de miembro o nunca tuvo una membresía, responde SIN_MEMBRESIA.
     */
    async obtenerMiEstado(usuarioId: string, fecha: string = hoyLocal()): Promise<EstadoMembresiaDetalle> {
        const miembroId = await this.membresiaRepository.findMiembroIdDeUsuario(usuarioId);
        if (!miembroId) return { ...SIN_MEMBRESIA };
        return this.obtenerEstado(miembroId, fecha);
    }

    /**
     * H3 · Una membresía del usuario autenticado. La pertenencia se decide con
     * el dueño leído de la base, no con datos del cliente.
     *
     * @throws {NotFoundException} si la membresía no existe.
     * @throws {ForbiddenException} si es de otro miembro.
     */
    async obtenerMiMembresia(membresiaId: string, usuarioId: string): Promise<MembresiaDetalleResponseDto> {
        const membresia = await this.membresiaRepository.findConDueno(membresiaId);
        if (!membresia) throw new NotFoundException(MEMBRESIA_NO_EXISTE);
        assertOwnership(membresia.miembro.usuarioId, usuarioId, MEMBRESIA_DE_OTRO_MIEMBRO);

        const dia = (fecha: Date | null) => fecha?.toISOString().slice(0, 10) ?? null;
        return {
            id: membresia.id,
            plan: membresia.nombrePlan,
            tipoPlan: membresia.tipoPlan,
            tipoOperacion: membresia.tipoOperacion,
            estado: membresia.estado,
            precio: membresia.precio.toNumber(),
            cantidadClases: membresia.cantidadClases,
            fechaInicioSolicitada: dia(membresia.fechaInicioSolicitada)!,
            fechaInicio: dia(membresia.fechaInicio),
            fechaVencimiento: dia(membresia.fechaVencimiento),
            tiposClaseIds: membresia.tiposClase.map((t) => t.tipoClaseId),
        };
    }

    /**
     * BE-2.5 · Lo llama el Módulo 5 cuando se aprueba el pago de una
     * membresía: la pasa a PAGADA con sus fechas de cobertura y guarda la
     * referencia del pago.
     *
     * Es idempotente: si la misma confirmación llega dos veces, la segunda no
     * hace nada (criterio 8). La actualización se condiciona a
     * estado = PENDIENTE_PAGO, así dos confirmaciones simultáneas no la
     * aplican dos veces.
     *
     * @throws {NotFoundException} si la membresía no existe.
     * @throws {ConflictException} si ya se pagó con otra referencia, o si la
     *   referencia ya se usó en otra membresía.
     */
    async aplicarPago(
        membresiaId: string,
        referenciaPago: string,
        fechaPago: Date,
        tx?: Prisma.TransactionClient,
    ): Promise<ResultadoAplicarPago> {
        const referencia = referenciaPago?.trim() ?? '';
        if (referencia.length < 1 || referencia.length > 100) {
            throw new BadRequestException(REFERENCIA_PAGO_INVALIDA);
        }

        const actual = await this.membresiaRepository.findById(membresiaId, tx);
        if (!actual) throw new NotFoundException(MEMBRESIA_NO_EXISTE);
        if (actual.estado !== EstadoMembresia.PENDIENTE_PAGO) {
            return this.yaPagada(actual, referencia);
        }

        const cobertura = calcularCobertura(
            actual.fechaInicioSolicitada.toISOString().slice(0, 10),
            fechaPago,
            actual.tipoPlan,
        );

        const pagada = await this.membresiaRepository.marcarPagada(membresiaId, referencia, cobertura, tx);
        if (pagada === 'REFERENCIA_EN_USO') throw new ConflictException(REFERENCIA_PAGO_EN_USO);
        if (pagada) return { aplicado: true, membresia: pagada };

        // Otra confirmación la pagó entre la lectura y la actualización.
        const despues = await this.membresiaRepository.findById(membresiaId, tx);
        if (!despues) throw new NotFoundException(MEMBRESIA_NO_EXISTE);
        return this.yaPagada(despues, referencia);
    }

    private yaPagada(membresia: Membresia, referencia: string): ResultadoAplicarPago {
        if (membresia.pagoAplicadoRef === referencia) return { aplicado: false, membresia };
        throw new ConflictException(MEMBRESIA_PAGADA_CON_OTRO_PAGO);
    }
}
