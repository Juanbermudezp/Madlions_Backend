import { Injectable } from '@nestjs/common';
import { MaquinaRepository, type FiltrosMaquina } from '@Maquinas/repositories';
import {
    MaquinaInternaResponseDto,
    MaquinaResponseDto,
    type MaquinasResponseDto,
} from '@Maquinas/dto';
import { Rol } from '@PrismaClient';
import { puedeVerDatosInternos } from './reglas-maquina.js';

/**
 * Consulta del estado de las máquinas (H17).
 *
 * Decide qué DTO de respuesta usar según el rol: el motivo interno y el
 * usuario del último cambio no salen del backend si quien pregunta es un
 * miembro o recepción.
 */
@Injectable()
export class MaquinasService {
    constructor(private readonly maquinaRepository: MaquinaRepository) { }

    async listar(rol: Rol, filtros: FiltrosMaquina): Promise<MaquinasResponseDto> {
        // El resumen desglosa los estados, así que se cuenta sin ese filtro:
        // ver solo las máquinas en mantenimiento no deja los otros dos
        // contadores en 0.
        const { estado: _estado, ...inventario } = filtros;

        const [maquinas, resumen] = await Promise.all([
            this.maquinaRepository.findTodas(filtros),
            this.maquinaRepository.contarPorEstado(inventario),
        ]);

        const conDatosInternos = puedeVerDatosInternos(rol);

        return {
            resumen,
            maquinas: maquinas.map((maquina) =>
                conDatosInternos
                    ? MaquinaInternaResponseDto.fromEntity(maquina)
                    : MaquinaResponseDto.fromEntity(maquina),
            ),
        };
    }
}
