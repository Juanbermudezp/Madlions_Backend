import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';

/** Datos de un miembro encontrado por la búsqueda. */
export interface MiembroEncontrado {
    id: string;
    nombre: string;
    apellido: string;
    codigo: string;
    documento: string;
}

/** Máximo de resultados de la búsqueda. */
export const LIMITE_BUSQUEDA = 20;

// Letras con tilde que se igualan a la letra simple (también ñ -> n). Debe
// coincidir con normalizarBusqueda().
const CON_TILDE = 'áàäâéèëêíìïîóòöôúùüûñ';
const SIN_TILDE = 'aaaaeeeeiiiioooouuuun';

/** Único punto que lee la tabla `miembro` para la búsqueda. */
@Injectable()
export class MiembroRepository {
    constructor(private readonly prisma: PrismaService) { }

    /**
     * Busca por nombre y apellido (en cualquier orden, sin mayúsculas ni
     * tildes) o por documento o código exactos.
     *
     * @param patron texto ya normalizado y con los comodines de LIKE escapados.
     * @param exacto texto tal como llegó (sin espacios en los extremos).
     */
    buscar(patron: string, exacto: string): Promise<MiembroEncontrado[]> {
        const like = `%${patron}%`;
        return this.prisma.$queryRaw<MiembroEncontrado[]>`
            SELECT m.id, u.nombre, u.apellido, m.codigo_miembro AS codigo, m.documento
            FROM miembro m
            JOIN usuario u ON u.id = m.usuario_id
            WHERE translate(lower(u.nombre || ' ' || u.apellido), ${CON_TILDE}, ${SIN_TILDE}) LIKE ${like}
               OR translate(lower(u.apellido || ' ' || u.nombre), ${CON_TILDE}, ${SIN_TILDE}) LIKE ${like}
               OR m.documento = ${exacto}
               OR m.codigo_miembro = upper(${exacto})
            ORDER BY u.apellido, u.nombre, m.codigo_miembro
            LIMIT ${LIMITE_BUSQUEDA}`;
    }
}
