import { Injectable } from '@nestjs/common';
import { hoyLocal } from '@Common/fechas';
import { CobroAdminRepository } from '@Cobros/repositories';
import type { CobroAdminDto, CobrosAdminQueryDto, CobrosAdminResponseDto } from '@Cobros/dto';
import { EstadoCobro } from '@PrismaClient';
// Import directo del archivo (no del barrel @Miembros/services) para no
// cargar el módulo de miembros, que a su vez depende de membresías y cobros.
import { escaparLike, normalizarBusqueda } from '../../miembros/services/normalizar-busqueda.js';
import { aDia, estaHabilitado } from './reglas-cobro.js';

/** Cobros por página (H13). */
export const COBROS_POR_PAGINA = 20;

/** Consulta administrativa de cobros (H13, BE-13.1). Solo lectura. */
@Injectable()
export class CobrosAdminService {
    constructor(private readonly cobroAdminRepository: CobroAdminRepository) { }

    /**
     * Lista los cobros con los filtros indicados. `total` y `sumaMontos`
     * corresponden a todo el conjunto filtrado, no solo a la página.
     * `habilitado` se calcula con la fecha de hoy en El Salvador: una
     * renovación anticipada sale `habilitado: false` con su `habilitadoDesde`.
     */
    async listar(query: CobrosAdminQueryDto, hoy: string = hoyLocal()): Promise<CobrosAdminResponseDto> {
        const estado = query.estado ?? EstadoCobro.PENDIENTE;
        const pagina = query.pagina ?? 1;
        const texto = normalizarBusqueda(query.q ?? '');

        let miembroIds: string[] | undefined;
        if (texto) {
            miembroIds = await this.cobroAdminRepository.idsDeMiembros(escaparLike(texto));
            if (miembroIds.length === 0) return { items: [], total: 0, sumaMontos: 0, pagina };
        }

        const { cobros, total, sumaMontos } = await this.cobroAdminRepository.listar(
            { estado, concepto: query.concepto, miembroIds },
            (pagina - 1) * COBROS_POR_PAGINA,
            COBROS_POR_PAGINA,
        );

        const items = cobros.map((cobro): CobroAdminDto => {
            const referencia = cobro.intentos[0]?.referencia;
            return {
                id: cobro.id,
                miembro: {
                    nombre: `${cobro.miembro.usuario.nombre} ${cobro.miembro.usuario.apellido}`,
                    codigo: cobro.miembro.codigoMiembro,
                },
                concepto: cobro.concepto,
                detalle: cobro.detalle,
                monto: cobro.monto.toNumber(),
                creadoEn: cobro.creadoEn.toISOString(),
                habilitado: estaHabilitado(cobro, hoy),
                habilitadoDesde: cobro.habilitadoDesde ? aDia(cobro.habilitadoDesde) : null,
                pagadoEn: cobro.pagadoEn?.toISOString() ?? null,
                ...(referencia ? { referencia } : {}),
            };
        });

        return { items, total, sumaMontos: sumaMontos?.toNumber() ?? 0, pagina };
    }
}