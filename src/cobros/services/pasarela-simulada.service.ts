import { Inject, Injectable, Optional } from '@nestjs/common';
import type { ResultadoPago } from '@PrismaClient';
import { MENSAJES_PASARELA, resultadoPorTarjeta, soloDigitos } from './reglas-pago.js';

/** Datos de la tarjeta. Nunca se guardan ni se registran en logs. */
export interface DatosTarjeta {
    titular: string;
    numero: string;
    vencimiento: string;
    cvv: string;
}

export interface RespuestaPasarela {
    resultado: ResultadoPago;
    mensaje: string;
    /** Lo único de la tarjeta que se puede guardar. */
    ultimos4: string;
}

/** Espera de la pasarela simulada; las pruebas la reducen. */
export const ESPERA_PASARELA_MS = 'ESPERA_PASARELA_MS';
const ESPERA_POR_DEFECTO_MS = 2000;

/**
 * Pasarela de pago simulada (H12). Tarda 2 segundos y decide según los
 * últimos 4 dígitos: 4242 aprueba, 0119 da error y 0002 (o cualquier otra
 * tarjeta válida) rechaza.
 *
 * No guarda ni registra los datos de la tarjeta: solo devuelve los últimos 4.
 */
@Injectable()
export class PasarelaSimuladaService {
    constructor(
        @Optional() @Inject(ESPERA_PASARELA_MS) private readonly esperaMs: number = ESPERA_POR_DEFECTO_MS,
    ) { }

    async procesar(tarjeta: DatosTarjeta): Promise<RespuestaPasarela> {
        await new Promise((listo) => setTimeout(listo, this.esperaMs));
        const resultado = resultadoPorTarjeta(tarjeta.numero);
        return {
            resultado,
            mensaje: MENSAJES_PASARELA[resultado],
            ultimos4: soloDigitos(tarjeta.numero).slice(-4),
        };
    }
}
