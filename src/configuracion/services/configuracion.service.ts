import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfiguracionRepository } from '@Configuracion/repositories';
import type {
    PrecioClasePuntualResponseDto,
    UpdatePrecioClasePuntualDto,
} from '@Configuracion/dto';

/** Clave de la fila que guarda el precio de la clase puntual. */
export const CLAVE_PRECIO_CLASE_PUNTUAL = 'precio_clase_puntual';

export const PRECIO_CLASE_PUNTUAL_NO_CONFIGURADO =
    'No está configurado el precio de la clase puntual.';

/** Configuración general del sistema (H1, BE-1.2). */
@Injectable()
export class ConfiguracionService {
    constructor(private readonly configuracionRepository: ConfiguracionRepository) { }

    /**
     * Precio vigente de la clase puntual, como texto con 2 decimales
     * ("10.00"). Lo usa el Módulo 3 (BE-9.2) al agendar una sesión.
     *
     * @throws {InternalServerErrorException} si falta la fila de configuración.
     */
    async obtenerPrecioClasePuntual(): Promise<string> {
        const fila = await this.configuracionRepository.findByClave(CLAVE_PRECIO_CLASE_PUNTUAL);
        if (!fila) {
            throw new InternalServerErrorException(PRECIO_CLASE_PUNTUAL_NO_CONFIGURADO);
        }
        return fila.valor;
    }

    async consultarPrecioClasePuntual(): Promise<PrecioClasePuntualResponseDto> {
        return { precio: await this.obtenerPrecioClasePuntual() };
    }

    async actualizarPrecioClasePuntual(
        dto: UpdatePrecioClasePuntualDto,
    ): Promise<PrecioClasePuntualResponseDto> {
        const fila = await this.configuracionRepository.guardar(
            CLAVE_PRECIO_CLASE_PUNTUAL,
            dto.precio.toFixed(2),
        );
        return { precio: fila.valor };
    }
}
