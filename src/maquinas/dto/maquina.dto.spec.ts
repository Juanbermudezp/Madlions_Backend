import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { EstadoMaquina, TipoMaquina, ZonaMaquina } from '@PrismaClient';
import { ListarMaquinasQueryDto } from './listar-maquinas-query.dto.js';
import {
    MaquinaInternaResponseDto,
    MaquinaResponseDto,
} from './maquina-response.dto.js';
import type { MaquinaConUltimoCambio } from '../repositories/maquina.repository.js';

// Las mismas opciones del ValidationPipe global de main.ts.
const opciones = { whitelist: true, forbidNonWhitelisted: true };

async function erroresQuery(datos: Record<string, unknown>) {
    const errores = await validate(plainToInstance(ListarMaquinasQueryDto, datos), opciones);
    return errores.map((e) => e.property);
}

function maquina(datos: Partial<MaquinaConUltimoCambio> = {}): MaquinaConUltimoCambio {
    return {
        id: 'm1',
        codigo: 'MAQ-001',
        nombre: 'Caminadora 1',
        tipo: TipoMaquina.CARDIO,
        zona: ZonaMaquina.PISO_1,
        estado: EstadoMaquina.EN_MANTENIMIENTO,
        fechaEstimadaRetorno: new Date('2026-11-20T00:00:00Z'),
        ultimoMotivo: 'Banda desgastada, se espera repuesto.',
        ultimoCambioPorId: 'u1',
        ultimoCambioPor: { id: 'u1', nombre: 'Alberto', apellido: 'Ramírez' },
        actualizadoEn: new Date('2026-11-15T12:00:00Z'),
        ...datos,
    };
}

describe('ListarMaquinasQueryDto', () => {
    it('acepta la consulta sin filtros', async () => {
        expect(await erroresQuery({})).toEqual([]);
    });

    it('acepta los tres filtros juntos', async () => {
        expect(
            await erroresQuery({
                estado: 'OPERATIVA',
                tipo: 'FUERZA',
                zona: 'PISO_2',
            }),
        ).toEqual([]);
    });

    it('trata el filtro vacío como "todos" (?estado=&tipo=&zona=)', async () => {
        expect(await erroresQuery({ estado: '', tipo: '', zona: '' })).toEqual([]);

        const query = plainToInstance(ListarMaquinasQueryDto, { estado: '', tipo: '', zona: '' });
        expect(query.estado).toBeUndefined();
        expect(query.tipo).toBeUndefined();
        expect(query.zona).toBeUndefined();
    });

    it('rechaza un estado, un tipo o una zona que no existen', async () => {
        expect(await erroresQuery({ estado: 'ROTA' })).toEqual(['estado']);
        expect(await erroresQuery({ tipo: 'PESAS' })).toEqual(['tipo']);
        expect(await erroresQuery({ zona: 'PISO_3' })).toEqual(['zona']);
    });

    it('rechaza un filtro que no es parte del contrato', async () => {
        expect(await erroresQuery({ marca: 'LifeFitness' })).toEqual(['marca']);
    });
});

describe('MaquinaResponseDto', () => {
    it('no incluye el motivo ni el usuario del último cambio', () => {
        const dto = MaquinaResponseDto.fromEntity(maquina());

        expect(dto).not.toHaveProperty('ultimoMotivo');
        expect(dto).not.toHaveProperty('ultimoCambioPor');
        expect(dto).not.toHaveProperty('ultimoCambioPorId');
        expect(Object.keys(dto).sort()).toEqual([
            'codigo',
            'estado',
            'fechaEstimadaRetorno',
            'id',
            'nombre',
            'tipo',
            'zona',
        ]);
    });

    it('devuelve la fecha estimada de retorno como AAAA-MM-DD', () => {
        expect(MaquinaResponseDto.fromEntity(maquina()).fechaEstimadaRetorno).toBe('2026-11-20');
    });

    it('devuelve null cuando no hay fecha estimada', () => {
        const dto = MaquinaResponseDto.fromEntity(maquina({ fechaEstimadaRetorno: null }));
        expect(dto.fechaEstimadaRetorno).toBeNull();
    });
});

describe('MaquinaInternaResponseDto', () => {
    it('agrega el motivo y el usuario del último cambio', () => {
        const dto = MaquinaInternaResponseDto.fromEntity(maquina());

        expect(dto.ultimoMotivo).toBe('Banda desgastada, se espera repuesto.');
        expect(dto.ultimoCambioPor).toEqual({ id: 'u1', nombre: 'Alberto', apellido: 'Ramírez' });
    });

    it('deja el motivo y el usuario en null si la máquina nunca cambió de estado', () => {
        const dto = MaquinaInternaResponseDto.fromEntity(
            maquina({
                estado: EstadoMaquina.OPERATIVA,
                fechaEstimadaRetorno: null,
                ultimoMotivo: null,
                ultimoCambioPorId: null,
                ultimoCambioPor: null,
            }),
        );

        expect(dto.ultimoMotivo).toBeNull();
        expect(dto.ultimoCambioPor).toBeNull();
    });
});
