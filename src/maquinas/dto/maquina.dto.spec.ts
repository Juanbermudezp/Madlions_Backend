import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { EstadoMaquina, TipoMaquina, ZonaMaquina } from '@PrismaClient';
import { CambiarEstadoMaquinaDto } from './cambiar-estado-maquina.dto.js';
import { HistorialMaquinaResponseDto } from './historial-maquina-response.dto.js';
import { ListarMaquinasQueryDto } from './listar-maquinas-query.dto.js';
import {
    MaquinaInternaResponseDto,
    MaquinaResponseDto,
} from './maquina-response.dto.js';
import type {
    CambioConUsuario,
    MaquinaConUltimoCambio,
} from '../repositories/maquina.repository.js';


const opciones = { whitelist: true, forbidNonWhitelisted: true };

async function erroresQuery(datos: Record<string, unknown>) {
    const errores = await validate(plainToInstance(ListarMaquinasQueryDto, datos), opciones);
    return errores.map((e) => e.property);
}

async function erroresCambio(datos: Record<string, unknown>) {
    const errores = await validate(plainToInstance(CambiarEstadoMaquinaDto, datos), opciones);
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

describe('CambiarEstadoMaquinaDto', () => {
    const MOTIVO = 'Banda desgastada, se espera el repuesto.';

    it('acepta el estado y el motivo', async () => {
        expect(await erroresCambio({ estado: 'EN_MANTENIMIENTO', motivo: MOTIVO })).toEqual([]);
    });

    it('acepta la fecha estimada de retorno', async () => {
        expect(
            await erroresCambio({
                estado: 'FUERA_DE_SERVICIO',
                motivo: MOTIVO,
                fechaEstimadaRetorno: '2026-12-01',
            }),
        ).toEqual([]);
    });

    it('la fecha vacía es como no mandarla', async () => {
        const dto = plainToInstance(CambiarEstadoMaquinaDto, {
            estado: 'EN_MANTENIMIENTO',
            motivo: MOTIVO,
            fechaEstimadaRetorno: '',
        });

        expect(await validate(dto, opciones)).toEqual([]);
        expect(dto.fechaEstimadaRetorno).toBeUndefined();
    });

    it('recorta los espacios del motivo', async () => {
        const dto = plainToInstance(CambiarEstadoMaquinaDto, {
            estado: 'EN_MANTENIMIENTO',
            motivo: `   ${MOTIVO}   `,
        });

        await validate(dto, opciones);
        expect(dto.motivo).toBe(MOTIVO);
    });

    it('acepta los motivos de 5 y de 250 caracteres', async () => {
        expect(await erroresCambio({ estado: 'OPERATIVA', motivo: 'a'.repeat(5) })).toEqual([]);
        expect(await erroresCambio({ estado: 'OPERATIVA', motivo: 'a'.repeat(250) })).toEqual([]);
    });

    it('rechaza el motivo de 4 y el de 251 caracteres', async () => {
        expect(await erroresCambio({ estado: 'OPERATIVA', motivo: 'a'.repeat(4) })).toEqual([
            'motivo',
        ]);
        expect(await erroresCambio({ estado: 'OPERATIVA', motivo: 'a'.repeat(251) })).toEqual([
            'motivo',
        ]);
    });

    it('rechaza el motivo de solo espacios', async () => {
        expect(await erroresCambio({ estado: 'OPERATIVA', motivo: '          ' })).toEqual([
            'motivo',
        ]);
    });

    it('rechaza el cambio sin motivo', async () => {
        expect(await erroresCambio({ estado: 'OPERATIVA' })).toEqual(['motivo']);
    });

    it('rechaza el cambio sin estado o con un estado inventado', async () => {
        expect(await erroresCambio({ motivo: MOTIVO })).toEqual(['estado']);
        expect(await erroresCambio({ estado: 'ROTA', motivo: MOTIVO })).toEqual(['estado']);
    });

    it('rechaza las fechas que no son AAAA-MM-DD o no existen', async () => {
        for (const fecha of ['01/12/2026', '2026-13-01', '2026-02-30', 'mañana']) {
            expect(
                await erroresCambio({
                    estado: 'EN_MANTENIMIENTO',
                    motivo: MOTIVO,
                    fechaEstimadaRetorno: fecha,
                }),
            ).toEqual(['fechaEstimadaRetorno']);
        }
    });

    it('rechaza un campo que no es parte del contrato', async () => {
        expect(
            await erroresCambio({ estado: 'OPERATIVA', motivo: MOTIVO, usuarioId: 'u1' }),
        ).toEqual(['usuarioId']);
    });
});

describe('HistorialMaquinaResponseDto', () => {
    const cambio: CambioConUsuario = {
        id: 'h1',
        maquinaId: 'm1',
        estadoAnterior: EstadoMaquina.OPERATIVA,
        estadoNuevo: EstadoMaquina.EN_MANTENIMIENTO,
        motivo: 'Banda desgastada, se espera el repuesto.',
        fechaEstimadaRetorno: new Date('2026-12-01T00:00:00Z'),
        cambiadoPorId: 'u1',
        cambiadoPor: { id: 'u1', nombre: 'Alberto', apellido: 'Ramírez' },
        cambiadoEn: new Date('2026-11-18T15:20:13.440Z'),
    };

    it('devuelve los datos del cambio con la fecha y la hora', () => {
        expect(HistorialMaquinaResponseDto.fromEntity(cambio)).toEqual({
            id: 'h1',
            estadoAnterior: EstadoMaquina.OPERATIVA,
            estadoNuevo: EstadoMaquina.EN_MANTENIMIENTO,
            motivo: 'Banda desgastada, se espera el repuesto.',
            fechaEstimadaRetorno: '2026-12-01',
            usuario: { id: 'u1', nombre: 'Alberto', apellido: 'Ramírez' },
            cambiadoEn: '2026-11-18T15:20:13.440Z',
        });
    });

    it('no arrastra el id de la máquina ni el del usuario que cambió', () => {
        const dto = HistorialMaquinaResponseDto.fromEntity(cambio);

        expect(dto).not.toHaveProperty('maquinaId');
        expect(dto).not.toHaveProperty('cambiadoPorId');
    });

    it('deja la fecha estimada en null cuando el cambio no la tuvo', () => {
        const dto = HistorialMaquinaResponseDto.fromEntity({
            ...cambio,
            fechaEstimadaRetorno: null,
        });

        expect(dto.fechaEstimadaRetorno).toBeNull();
    });
});
