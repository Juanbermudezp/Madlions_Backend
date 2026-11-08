import { Injectable } from '@nestjs/common';
import { ClaseRepository } from '@Clases/repositories';
import { ClaseResponseDto } from '@Clases/dto';
import { hoyLocal, rangoDeSemana } from '@Common/fechas';

@Injectable()
export class ClasesService {
  constructor(private readonly claseRepository: ClaseRepository) {}

  async listarSemana(
    entrenadorId: string,
    semana?: string,
  ): Promise<ClaseResponseDto[]> {
    const { desde, hasta } = rangoDeSemana(semana ?? hoyLocal());
    const clases = await this.claseRepository.findProgramadasDelEntrenadorEntre(
      entrenadorId,
      desde,
      hasta,
    );
    return clases.map((clase) => ClaseResponseDto.fromEntity(clase));
  }
}