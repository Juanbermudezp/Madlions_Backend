import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { MembresiaRepository } from '@Membresias/repositories';
import { EstadoMembresia, type Membresia } from '@PrismaClient';
import { calcularCobertura } from './reglas-cobertura.js';

export const MEMBRESIA_NO_EXISTE = 'La membresía no existe.';
export const MEMBRESIA_PAGADA_CON_OTRO_PAGO = 'La membresía ya fue pagada con otro pago.';
export const REFERENCIA_PAGO_INVALIDA = 'La referencia del pago es obligatoria y puede tener hasta 100 caracteres.';
export const REFERENCIA_PAGO_EN_USO = 'La referencia del pago ya se aplicó a otra membresía.';

export interface ResultadoAplicarPago {
    /** false si la misma confirmación ya se había aplicado (no hizo nada). */
    aplicado: boolean;
    membresia: Membresia;
}

/** Operaciones sobre membresías que piden otros módulos (H2). */
@Injectable()
export class MembresiasService {
    constructor(private readonly membresiaRepository: MembresiaRepository) { }

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
    ): Promise<ResultadoAplicarPago> {
        const referencia = referenciaPago?.trim() ?? '';
        if (referencia.length < 1 || referencia.length > 100) {
            throw new BadRequestException(REFERENCIA_PAGO_INVALIDA);
        }

        const actual = await this.membresiaRepository.findById(membresiaId);
        if (!actual) throw new NotFoundException(MEMBRESIA_NO_EXISTE);
        if (actual.estado !== EstadoMembresia.PENDIENTE_PAGO) {
            return this.yaPagada(actual, referencia);
        }

        const cobertura = calcularCobertura(
            actual.fechaInicioSolicitada.toISOString().slice(0, 10),
            fechaPago,
            actual.tipoPlan,
        );

        const pagada = await this.membresiaRepository.marcarPagada(membresiaId, referencia, cobertura);
        if (pagada === 'REFERENCIA_EN_USO') throw new ConflictException(REFERENCIA_PAGO_EN_USO);
        if (pagada) return { aplicado: true, membresia: pagada };

        // Otra confirmación la pagó entre la lectura y la actualización.
        const despues = await this.membresiaRepository.findById(membresiaId);
        if (!despues) throw new NotFoundException(MEMBRESIA_NO_EXISTE);
        return this.yaPagada(despues, referencia);
    }

    private yaPagada(membresia: Membresia, referencia: string): ResultadoAplicarPago {
        if (membresia.pagoAplicadoRef === referencia) return { aplicado: false, membresia };
        throw new ConflictException(MEMBRESIA_PAGADA_CON_OTRO_PAGO);
    }
}
