import { Injectable, NotFoundException } from '@nestjs/common';
import { assertOwnership } from '@Common/ownership';
import { ComprobanteRepository } from '@Cobros/repositories';
import type { ComprobanteResponseDto } from '@Cobros/dto';
import { Rol, type User } from '@PrismaClient';

export const COMPROBANTE_NO_EXISTE = 'El comprobante no existe.';
export const COMPROBANTE_AJENO = 'No tienes permiso para ver este comprobante.';

/** Formato del número de comprobante (CMP-000001). */
const NUMERO_COMPROBANTE = /^CMP-\d{6}$/;

/** Consulta de comprobantes (H12, BE-12.4). */
@Injectable()
export class ComprobantesService {
    constructor(private readonly comprobanteRepository: ComprobanteRepository) { }

    /**
     * El ADMINISTRADOR ve cualquier comprobante; el MIEMBRO solo los suyos
     * (el dueño se lee de la base: comprobante → cobro → miembro → usuario).
     *
     * @throws {NotFoundException} 404 si no existe (o el número no tiene el formato).
     * @throws {ForbiddenException} 403 si es de otro miembro.
     */
    async obtener(numero: string, usuario: Pick<User, 'id' | 'rol'>): Promise<ComprobanteResponseDto> {
        const comprobante = NUMERO_COMPROBANTE.test(numero)
            ? await this.comprobanteRepository.findPorNumero(numero)
            : null;
        if (!comprobante) throw new NotFoundException(COMPROBANTE_NO_EXISTE);

        const { miembro } = comprobante.cobro;
        if (usuario.rol !== Rol.ADMINISTRADOR) {
            assertOwnership(miembro.usuario.id, usuario.id, COMPROBANTE_AJENO);
        }

        return {
            numero: comprobante.numero,
            emitidoEn: comprobante.emitidoEn.toISOString(),
            miembro: { nombre: `${miembro.usuario.nombre} ${miembro.usuario.apellido}`, codigo: miembro.codigoMiembro },
            concepto: comprobante.cobro.concepto,
            detalle: comprobante.cobro.detalle,
            subtotal: comprobante.subtotal.toNumber(),
            iva: comprobante.iva.toNumber(),
            total: comprobante.total.toNumber(),
            referencia: comprobante.intento.referencia,
            ultimos4: comprobante.intento.ultimos4,
        };
    }
}
