import { Injectable } from '@nestjs/common';
import { hoyLocal } from '@Common/fechas';
import { CobroRepository, type DatosCobro } from '@Cobros/repositories';
import type { CobroResponseDto } from '@Cobros/dto';
import { ConceptoCobro, type Cobro, type EstadoCobro, type Prisma } from '@PrismaClient';
import { aDia, estaHabilitado } from './reglas-cobro.js';

export const DETALLE_COBRO_INVALIDO = 'El detalle del cobro es obligatorio y puede tener hasta 150 caracteres.';
export const MONTO_COBRO_INVALIDO = 'El monto del cobro debe ser mayor que 0.';
export const RENOVACION_SIN_FECHA =
    'Un cobro de renovación necesita la fecha de vencimiento de la membresía actual (habilitadoDesde).';

/**
 * Error de programación del módulo que pide el cobro (datos incompletos o
 * inválidos). No es un error del usuario: sale como 500 y se registra.
 */
export class CobroInvalidoError extends Error {
    constructor(mensaje: string) {
        super(mensaje);
        this.name = 'CobroInvalidoError';
    }
}

/** Cobros (Módulo 5). */
@Injectable()
export class CobrosService {
    constructor(private readonly cobroRepository: CobroRepository) { }

    /**
     * Genera un cobro PENDIENTE para los módulos 1 (membresías) y 3 (sesiones).
     *
     * - RENOVACION: `habilitadoDesde` es obligatorio y es la fecha de
     *   vencimiento de la membresía actual; antes de esa fecha no se puede
     *   pagar (supuesto S3).
     * - MEMBRESIA y SESION_ADICIONAL: se pueden pagar desde que se generan
     *   (`habilitadoDesde` null, salvo que el módulo indique otra fecha).
     *
     * Quien lo pide pasa su transacción (`tx`) para que, si algo falla, no
     * quede ni el cobro ni el registro que lo originó.
     *
     * @throws {CobroInvalidoError} si faltan datos o son inválidos.
     */
    async crearCobro(datos: DatosCobro, tx?: Prisma.TransactionClient): Promise<Cobro> {
        const detalle = datos.detalle?.trim() ?? '';
        if (detalle.length < 1 || detalle.length > 150) throw new CobroInvalidoError(DETALLE_COBRO_INVALIDO);
        if (!(Number(datos.monto) > 0)) throw new CobroInvalidoError(MONTO_COBRO_INVALIDO);

        const esRenovacion = datos.concepto === ConceptoCobro.RENOVACION;
        if (esRenovacion && !datos.habilitadoDesde) throw new CobroInvalidoError(RENOVACION_SIN_FECHA);

        return this.cobroRepository.create(
            { ...datos, detalle, habilitadoDesde: datos.habilitadoDesde ?? null },
            tx,
        );
    }

    /**
     * BE-12.2 · Cobros del miembro autenticado. El miembro sale del token;
     * `habilitado` se calcula con la fecha de hoy en El Salvador.
     */
    async listarMios(
        usuarioId: string,
        estado?: EstadoCobro,
        hoy: string = hoyLocal(),
    ): Promise<CobroResponseDto[]> {
        const cobros = await this.cobroRepository.findDeUsuario(usuarioId, estado);
        return cobros.map((cobro) => ({
            id: cobro.id,
            concepto: cobro.concepto,
            detalle: cobro.detalle,
            monto: cobro.monto.toNumber(),
            estado: cobro.estado,
            habilitado: estaHabilitado(cobro, hoy),
            habilitadoDesde: cobro.habilitadoDesde ? aDia(cobro.habilitadoDesde) : null,
            comprobanteNumero: cobro.comprobante?.numero ?? null,
        }));
    }
}
