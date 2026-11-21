import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { aFechaLocal, hoyLocal, sumarDias } from '@Common/fechas';
import { ReportesRepository } from '@Reportes/repositories';
import type { DetalleIngresosQueryDto, DetalleIngresosResponseDto, ReporteIngresosResponseDto, ReporteOcupacionResponseDto, ReporteRenovacionResponseDto } from '@Reportes/dto';
import { ResultadoPago } from '@PrismaClient';
import { calcularOcupacion, etiquetaOcupacion, resolverRango } from './reglas-reporte.js';
import { periodoAnterior, resumirIngresos } from './reglas-ingresos.js';
import { resumirRenovacion } from './reglas-renovacion.js';

/** Reportes y analítica para la administración (Módulo 10). */
@Injectable()
export class ReportesService {
    constructor(private readonly reportesRepository: ReportesRepository) { }

    /** H28: reloj único controlable; rango H26 y clasificación por día local. */
    async renovacion(desde?: string, hasta?: string, ahora: Date = new Date()): Promise<ReporteRenovacionResponseDto> {
        const rango = this.rango(desde, hasta, ahora);
        const filas = await this.reportesRepository.renovacion(rango.desde, rango.hasta, ahora);
        return resumirRenovacion(filas, hoyLocal(ahora));
    }

    /**
     * Valida el rango y lo convierte a instantes UTC: [desde 00:00, hasta + 1 día 00:00)
     * en hora de El Salvador. Lo reutilizan los demás reportes.
     *
     * @throws {BadRequestException} con el motivo si el rango no es válido.
     */
    rango(desde: string | undefined, hasta: string | undefined, ahora: Date = new Date()) {
        const resultado = resolverRango(desde, hasta, ahora);
        if ('error' in resultado) throw new BadRequestException(resultado.error);
        return {
            ...resultado,
            inicio: aFechaLocal(resultado.desde, '00:00'),
            fin: aFechaLocal(sumarDias(resultado.hasta, 1), '00:00'),
        };
    }

    /** BE-27.1: ambos períodos se leen en una sola consulta coherente. */
    async ingresos(desde?: string, hasta?: string, ahora: Date = new Date()): Promise<ReporteIngresosResponseDto> {
        const rango = this.rango(desde, hasta, ahora);
        const anterior = periodoAnterior(rango.desde, rango.hasta);
        const filas = await this.reportesRepository.ingresosPorDia(aFechaLocal(anterior.desde, '00:00'), rango.fin);
        return resumirIngresos(filas, rango.desde, rango.hasta);
    }

    /** BE-27.2: fecha del pago en UTC-6; ninguna referencia de intentos rechazados. */
    async detalleIngresos(query: DetalleIngresosQueryDto, ahora: Date = new Date()): Promise<DetalleIngresosResponseDto> {
        const rango = this.rango(query.desde, query.hasta, ahora);
        const pagina = query.pagina ?? 1;
        const resultado = await this.reportesRepository.detalleIngresos(query.concepto, rango.inicio, rango.fin, pagina);
        return { total: resultado.total, pagina, items: resultado.pagos.map((pago) => {
            const intento = pago.comprobante?.intento;
            if (!pago.pagadoEn || !intento || intento.resultado !== ResultadoPago.APROBADO || intento.cobroId !== pago.id) {
                // H12 los crea atómicamente. Si hay datos inconsistentes no se
                // inventa una referencia ni se sustituye por el último intento.
                throw new InternalServerErrorException('No se pudo identificar el pago aprobado de un cobro.');
            }
            return { miembro: `${pago.miembro.usuario.nombre} ${pago.miembro.usuario.apellido}`,
                codigo: pago.miembro.codigoMiembro, fecha: hoyLocal(pago.pagadoEn), monto: pago.monto.toNumber(),
                referencia: intento.referencia };
        }) };
    }

    /** BE-26.1 · Ocupación de las clases impartidas por tipo y entrenador, de mayor a menor. */
    async ocupacion(
        desde: string | undefined,
        hasta: string | undefined,
        ahora: Date = new Date(),
    ): Promise<ReporteOcupacionResponseDto> {
        const rango = this.rango(desde, hasta, ahora);
        const filas = await this.reportesRepository.ocupacionPorTipoYEntrenador(rango.inicio, rango.fin, ahora);

        return {
            desde: rango.desde,
            hasta: rango.hasta,
            filas: filas
                .map((f) => {
                    const ocupacion = calcularOcupacion(f.reservasConfirmadas, f.cupoTotal);
                    return {
                        tipoClase: { id: f.tipoClaseId, nombre: f.tipoClase },
                        entrenador: { id: f.entrenadorId, nombre: f.entrenador },
                        vecesImpartida: f.vecesImpartida,
                        reservasConfirmadas: f.reservasConfirmadas,
                        cupoTotal: f.cupoTotal,
                        ocupacion,
                        etiqueta: etiquetaOcupacion(ocupacion),
                    };
                })
                .sort(
                    (a, b) =>
                        b.ocupacion - a.ocupacion ||
                        a.tipoClase.nombre.localeCompare(b.tipoClase.nombre, 'es') ||
                        a.entrenador.nombre.localeCompare(b.entrenador.nombre, 'es'),
                ),
        };
    }
}
