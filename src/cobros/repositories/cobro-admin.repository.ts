import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { EstadoCobro, ResultadoPago, type Cobro, type ConceptoCobro, type Prisma } from '@PrismaClient';

/** Filtros ya validados de la consulta administrativa (H13). */
export interface FiltroCobrosAdmin {
    estado: EstadoCobro;
    concepto?: ConceptoCobro;
    /** Solo cobros de estos miembros (resultado de la búsqueda). */
    miembroIds?: string[];
}

/** Cobro con el miembro y la referencia del pago aprobado (si se pagó). */
export type CobroAdmin = Cobro & {
    miembro: { codigoMiembro: string; usuario: { nombre: string; apellido: string } };
    intentos: { referencia: string }[];
};

export interface PaginaCobrosAdmin {
    cobros: CobroAdmin[];
    total: number;
    /** Suma de los montos de TODOS los cobros filtrados (no solo de la página). */
    sumaMontos: Prisma.Decimal | null;
}

// Letras con tilde que se igualan a la letra simple (también ñ -> n). Debe
// coincidir con normalizarBusqueda(), igual que en MiembroRepository.
const CON_TILDE = 'áàäâéèëêíìïîóòöôúùüûñ';
const SIN_TILDE = 'aaaaeeeeiiiioooouuuun';

/** Lecturas de la tabla `cobro` para el administrador (H13). Solo lectura. */
@Injectable()
export class CobroAdminRepository {
    constructor(private readonly prisma: PrismaService) { }

    /**
     * Miembros cuyo nombre y apellido (en cualquier orden, sin mayúsculas ni
     * tildes) o código contienen el texto.
     *
     * @param patron texto ya normalizado y con los comodines de LIKE escapados.
     */
    async idsDeMiembros(patron: string): Promise<string[]> {
        const like = `%${patron}%`;
        const filas = await this.prisma.$queryRaw<{ id: string }[]>`
            SELECT m.id
            FROM miembro m
            JOIN usuario u ON u.id = m.usuario_id
            WHERE translate(lower(u.nombre || ' ' || u.apellido), ${CON_TILDE}, ${SIN_TILDE}) LIKE ${like}
                OR translate(lower(u.apellido || ' ' || u.nombre), ${CON_TILDE}, ${SIN_TILDE}) LIKE ${like}
                OR lower(m.codigo_miembro) LIKE ${like}`;
        return filas.map((f) => f.id);
    }

    /**
     * Una página de cobros con el total y la suma del conjunto filtrado. Las
     * tres consultas van en la misma transacción para que los números
     * coincidan con la lista aunque alguien pague en ese momento.
     *
     * Orden: pendientes por creación (el más antiguo primero); pagados por
     * fecha de pago (el más reciente primero). El id desempata para que la
     * paginación sea estable.
     */
    async listar(filtro: FiltroCobrosAdmin, saltar: number, tomar: number): Promise<PaginaCobrosAdmin> {
        const where: Prisma.CobroWhereInput = {
            estado: filtro.estado,
            ...(filtro.concepto ? { concepto: filtro.concepto } : {}),
            ...(filtro.miembroIds ? { miembroId: { in: filtro.miembroIds } } : {}),
        };
        const orderBy: Prisma.CobroOrderByWithRelationInput[] =
            filtro.estado === EstadoCobro.PENDIENTE
                ? [{ creadoEn: 'asc' }, { id: 'asc' }]
                : [{ pagadoEn: 'desc' }, { id: 'asc' }];

        const [cobros, total, suma] = await this.prisma.$transaction([
            this.prisma.cobro.findMany({
                where,
                orderBy,
                skip: saltar,
                take: tomar,
                include: {
                    miembro: {
                        select: { codigoMiembro: true, usuario: { select: { nombre: true, apellido: true } } },
                    },
                    intentos: {
                        where: { resultado: ResultadoPago.APROBADO },
                        select: { referencia: true },
                        take: 1,
                    },
                },
            }),
            this.prisma.cobro.count({ where }),
            this.prisma.cobro.aggregate({ where, _sum: { monto: true } }),
        ]);

        return { cobros, total, sumaMontos: suma._sum.monto };
    }
}