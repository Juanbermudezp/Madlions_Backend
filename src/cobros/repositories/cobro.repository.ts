import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import {
    EstadoCobro,
    ResultadoPago,
    type Cobro,
    type ConceptoCobro,
    type Prisma,
    type ReferenciaCobro,
} from '@PrismaClient';

/** Datos de un cobro nuevo. */
export interface DatosCobro {
    miembroId: string;
    concepto: ConceptoCobro;
    /** Plan de la membresía, o fecha y entrenador de la sesión (máximo 150 caracteres). */
    detalle: string;
    monto: number | Prisma.Decimal;
    referenciaTipo: ReferenciaCobro;
    referenciaId: string;
    /** Desde cuándo se puede pagar (renovaciones); null = desde que se genera. */
    habilitadoDesde?: Date | null;
}

/** Cobro con el usuario dueño (para comprobar la pertenencia). */
export type CobroConDueno = Cobro & { miembro: { usuarioId: string } };

/** Intento de pago a registrar. Solo los últimos 4 dígitos de la tarjeta. */
export interface DatosIntento {
    cobroId: string;
    resultado: ResultadoPago;
    mensaje: string;
    ultimos4: string;
    referencia: string;
}

/** Montos del comprobante (IVA incluido en el total). */
export interface MontosComprobante {
    subtotal: number;
    iva: number;
    total: number;
}

/** Cobro con el número de su comprobante, si ya se pagó. */
export type CobroConComprobante = Cobro & { comprobante: { numero: string } | null };

/** Único punto que habla con la tabla `cobro`. */
@Injectable()
export class CobroRepository {
    constructor(private readonly prisma: PrismaService) { }

    /**
     * Crea el cobro. Si llega `tx`, se escribe dentro de esa transacción, así
     * el registro que lo origina y el cobro se guardan juntos o no se guarda
     * ninguno.
     */
    create(data: DatosCobro, tx?: Prisma.TransactionClient): Promise<Cobro> {
        return (tx ?? this.prisma).cobro.create({ data });
    }

    findConDueno(id: string): Promise<CobroConDueno | null> {
        return this.prisma.cobro.findUnique({
            where: { id },
            include: { miembro: { select: { usuarioId: true } } },
        });
    }

    /** Intento rechazado o con error: queda registrado y el cobro sigue PENDIENTE. */
    registrarIntento(datos: DatosIntento): Promise<{ id: string }> {
        return this.prisma.intentoPago.create({ data: datos, select: { id: true } });
    }

    /**
     * Pago aprobado, en una sola transacción:
     * 1. pasa el cobro de PENDIENTE a PAGADO solo si sigue PENDIENTE
     *    (operación condicionada: de varios intentos a la vez, gana uno; los
     *    demás esperan el bloqueo de la fila y salen sin tomar número);
     * 2. registra el intento APROBADO;
     * 3. ejecuta `confirmar` (p. ej. activar la membresía) con la misma
     *    transacción: si falla, no queda nada;
     * 4. al final, toma el siguiente número de `comprobante_numero_seq` y
     *    emite el comprobante.
     *
     * El número se toma en el último paso a propósito: una secuencia nunca
     * repite números, pero si la transacción se deshiciera DESPUÉS de tomarlo
     * quedaría un hueco. Así, ni los intentos que pierden la carrera ni una
     * confirmación que falla consumen un número.
     *
     * @returns el número del comprobante, o null si el cobro ya no estaba PENDIENTE.
     */
    confirmarPago(
        intento: DatosIntento,
        montos: MontosComprobante,
        pagadoEn: Date,
        confirmar: (tx: Prisma.TransactionClient) => Promise<void>,
    ): Promise<string | null> {
        return this.prisma.$transaction(async (tx) => {
            const { count } = await tx.cobro.updateMany({
                where: { id: intento.cobroId, estado: EstadoCobro.PENDIENTE },
                data: { estado: EstadoCobro.PAGADO, pagadoEn },
            });
            if (count === 0) return null;

            const { id: intentoId } = await tx.intentoPago.create({ data: intento, select: { id: true } });
            await confirmar(tx);

            const [{ numero }] = await tx.$queryRaw<{ numero: string }[]>`
                SELECT 'CMP-' || lpad(nextval('comprobante_numero_seq')::text, 6, '0') AS numero
            `;
            await tx.comprobante.create({
                data: { numero, cobroId: intento.cobroId, intentoId, ...montos, emitidoEn: pagadoEn },
            });
            return numero;
        });
    }

    /**
     * Cobros del miembro que pertenece al usuario. El filtro va por la
     * relación cobro → miembro → usuario, así nunca se devuelven cobros ajenos.
     */
    findDeUsuario(usuarioId: string, estado?: EstadoCobro): Promise<CobroConComprobante[]> {
        return this.prisma.cobro.findMany({
            where: { miembro: { usuarioId }, ...(estado ? { estado } : {}) },
            include: { comprobante: { select: { numero: true } } },
            orderBy: { creadoEn: 'desc' },
        });
    }
}
