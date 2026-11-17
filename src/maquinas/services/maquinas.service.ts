import { Injectable } from '@nestjs/common';
import { MaquinaRepository, type FiltrosMaquina } from '@Maquinas/repositories';
import {
    MaquinaInternaResponseDto,
    MaquinaResponseDto,
    type MaquinasResponseDto,
} from '@Maquinas/dto';
import { Rol } from '@PrismaClient';
import { puedeVerDatosInternos } from './reglas-maquina.js';

// Consulta del estado de las máquinas (H17).

@Injectable()
export class MaquinasService {
    constructor(private readonly maquinaRepository: MaquinaRepository) { }

    async listar(rol: Rol, filtros: FiltrosMaquina): Promise<MaquinasResponseDto> {
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
