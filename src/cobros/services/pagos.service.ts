import {
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { assertOwnership } from '@Common/ownership';
import { hoyLocal } from '@Common/fechas';
import { CobroRepository } from '@Cobros/repositories';
import type { PagoResponseDto } from '@Cobros/dto';
import { EstadoCobro, ResultadoPago } from '@PrismaClient';
import { CobrosService } from './cobros.service.js';
import { PasarelaSimuladaService, type DatosTarjeta } from './pasarela-simulada.service.js';
import { aDia, estaHabilitado } from './reglas-cobro.js';
import { desglosarIva, generarReferencia } from './reglas-pago.js';

export const COBRO_NO_EXISTE = 'El cobro no existe.';
export const COBRO_AJENO = 'No tienes permiso para pagar este cobro.';
export const COBRO_YA_PAGADO = 'El cobro ya fue pagado.';
export const COBRO_NO_HABILITADO = (fecha: string) =>
    `No habilitado: podrás pagar desde el ${fecha.split('-').reverse().join('/')}`;

/**
 * Pago de un cobro con la pasarela simulada (H12, BE-12.3).
 *
 * Nunca guarda ni registra los datos de la tarjeta: solo los últimos 4
 * dígitos del intento.
 */
@Injectable()
export class PagosService {
    constructor(
        private readonly cobroRepository: CobroRepository,
        private readonly cobrosService: CobrosService,
        private readonly pasarela: PasarelaSimuladaService,
    ) { }

    /**
     * @throws {NotFoundException} 404 si el cobro no existe.
     * @throws {ForbiddenException} 403 si es de otro miembro.
     * @throws {ConflictException} 409 si ya está pagado, si es una renovación
     *   que todavía no se puede pagar, o si otro intento lo pagó al mismo tiempo.
     */
    async pagar(cobroId: string, usuarioId: string, tarjeta: DatosTarjeta): Promise<PagoResponseDto> {
        const cobro = await this.cobroRepository.findConDueno(cobroId);
        if (!cobro) throw new NotFoundException(COBRO_NO_EXISTE);
        assertOwnership(cobro.miembro.usuarioId, usuarioId, COBRO_AJENO);
        if (cobro.estado !== EstadoCobro.PENDIENTE) throw new ConflictException(COBRO_YA_PAGADO);

        const hoy = hoyLocal();
        if (!estaHabilitado(cobro, hoy)) {
            throw new ConflictException(COBRO_NO_HABILITADO(aDia(cobro.habilitadoDesde!)));
        }

        // La espera de la pasarela (2 s) va fuera de la transacción.
        const respuesta = await this.pasarela.procesar(tarjeta);
        const intento = {
            cobroId,
            resultado: respuesta.resultado,
            mensaje: respuesta.mensaje,
            ultimos4: respuesta.ultimos4,
            referencia: generarReferencia(hoy),
        };

        if (respuesta.resultado !== ResultadoPago.APROBADO) {
            // Rechazado o error: queda registrado y el cobro sigue PENDIENTE.
            await this.cobroRepository.registrarIntento(intento);
            return { resultado: respuesta.resultado, mensaje: respuesta.mensaje };
        }

        const confirmacion = this.cobrosService.confirmacionDe(cobro.referenciaTipo);
        const pagadoEn = new Date();
        const comprobanteNumero = await this.cobroRepository.confirmarPago(
            intento,
            desglosarIva(cobro.monto.toFixed(2)),
            pagadoEn,
            async (tx) => {
                await confirmacion?.(
                    { referenciaId: cobro.referenciaId, referenciaPago: intento.referencia, fechaPago: pagadoEn },
                    tx,
                );
            },
        );
        // Otro intento simultáneo lo pagó primero: este no confirma nada.
        if (!comprobanteNumero) throw new ConflictException(COBRO_YA_PAGADO);

        return { resultado: ResultadoPago.APROBADO, referencia: intento.referencia, comprobanteNumero };
    }
}
