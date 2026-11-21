import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { MaquinaRepository, type FiltrosMaquina } from '@Maquinas/repositories';
import {
    HistorialMaquinaResponseDto,
    MaquinaInternaResponseDto,
    MaquinaResponseDto,
    type CambiarEstadoMaquinaDto,
    type MaquinasResponseDto,
} from '@Maquinas/dto';
import { hoyLocal } from '@Common/fechas';
import { Rol } from '@PrismaClient';
import {
    errorDeFechaEstimada,
    esMismoEstado,
    fechaEstimadaTrasElCambio,
    puedeVerDatosInternos,
} from './reglas-maquina.js';

export const MAQUINA_NO_EXISTE = 'La máquina no existe.';
export const MAQUINA_YA_EN_ESE_ESTADO = 'La máquina ya está en ese estado.';

// Consulta del estado de las máquinas (H17) y su mantenimiento (H18).

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

    /**
     * H18 · Cambia el estado de una máquina y lo deja en el historial.
     * Quién puede hacerlo lo decide @Roles en el controlador (supuesto S13).
     *
     * @throws {NotFoundException} si la máquina no existe.
     * @throws {ConflictException} si ya está en ese estado.
     * @throws {BadRequestException} si la fecha estimada no corresponde.
     */
    async cambiarEstado(
        maquinaId: string,
        usuarioId: string,
        datos: CambiarEstadoMaquinaDto,
    ): Promise<MaquinaInternaResponseDto> {
        const maquina = await this.maquinaRepository.findById(maquinaId);
        if (!maquina) throw new NotFoundException(MAQUINA_NO_EXISTE);

        if (esMismoEstado(maquina.estado, datos.estado)) {
            throw new ConflictException(MAQUINA_YA_EN_ESE_ESTADO);
        }

        const errorFecha = errorDeFechaEstimada(
            datos.estado,
            datos.fechaEstimadaRetorno,
            hoyLocal(),
        );
        if (errorFecha) throw new BadRequestException(errorFecha);

        const actualizada = await this.maquinaRepository.cambiarEstado({
            maquinaId,
            estadoAnterior: maquina.estado,
            estadoNuevo: datos.estado,
            motivo: datos.motivo,
            fechaEstimadaRetorno: fechaEstimadaTrasElCambio(
                datos.estado,
                datos.fechaEstimadaRetorno,
            ),
            usuarioId,
        });
        // Otra petición cambió el estado entre la lectura y el UPDATE.
        if (!actualizada) throw new ConflictException(MAQUINA_YA_EN_ESE_ESTADO);

        return MaquinaInternaResponseDto.fromEntity(actualizada);
    }

    /**
     * H18 · Historial de una máquina, del más reciente al más antiguo.
     *
     * @throws {NotFoundException} si la máquina no existe.
     */
    async historial(maquinaId: string): Promise<HistorialMaquinaResponseDto[]> {
        const maquina = await this.maquinaRepository.findById(maquinaId);
        if (!maquina) throw new NotFoundException(MAQUINA_NO_EXISTE);

        const cambios = await this.maquinaRepository.findHistorial(maquinaId);
        return cambios.map((cambio) => HistorialMaquinaResponseDto.fromEntity(cambio));
    }
}
