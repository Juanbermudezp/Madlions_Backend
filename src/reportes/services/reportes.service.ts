import { BadRequestException, Injectable } from '@nestjs/common';
import { aFechaLocal, sumarDias } from '@Common/fechas';
import { ReportesRepository } from '@Reportes/repositories';
import type { ReporteOcupacionResponseDto } from '@Reportes/dto';
import { calcularOcupacion, etiquetaOcupacion, resolverRango } from './reglas-reporte.js';

/** Reportes y analítica para la administración (Módulo 10). */
@Injectable()
export class ReportesService {
    constructor(private readonly reportesRepository: ReportesRepository) { }

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
