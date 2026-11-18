import type { MaquinaConUltimoCambio, MaquinaRepository } from '@Maquinas/repositories';
import { EstadoMaquina, Rol, TipoMaquina, ZonaMaquina } from '@PrismaClient';
import { MaquinasService } from './maquinas.service.js';

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

const RESUMEN = {
    [EstadoMaquina.OPERATIVA]: 10,
    [EstadoMaquina.EN_MANTENIMIENTO]: 1,
    [EstadoMaquina.FUERA_DE_SERVICIO]: 1,
};

describe('MaquinasService', () => {
    const repo = {
        findTodas: vi.fn(),
        contarPorEstado: vi.fn(),
    };
    const service = new MaquinasService(repo as unknown as MaquinaRepository);

    beforeEach(() => {
        vi.resetAllMocks();
        repo.findTodas.mockResolvedValue([maquina()]);
        repo.contarPorEstado.mockResolvedValue(RESUMEN);
    });

    describe('datos internos según el rol', () => {
        it('el miembro no recibe el motivo ni quién hizo el último cambio', async () => {
            const { maquinas } = await service.listar(Rol.MIEMBRO, {});

            expect(maquinas[0]).not.toHaveProperty('ultimoMotivo');
            expect(maquinas[0]).not.toHaveProperty('ultimoCambioPor');
            expect(JSON.stringify(maquinas[0])).not.toContain('ultimoMotivo');
            expect(JSON.stringify(maquinas[0])).not.toContain('Alberto');
        });

        it('recepción tampoco los recibe', async () => {
            const { maquinas } = await service.listar(Rol.RECEPCION, {});

            expect(maquinas[0]).not.toHaveProperty('ultimoMotivo');
            expect(maquinas[0]).not.toHaveProperty('ultimoCambioPor');
        });

        it('el administrador y el entrenador sí los reciben', async () => {
            for (const rol of [Rol.ADMINISTRADOR, Rol.ENTRENADOR]) {
                const { maquinas } = await service.listar(rol, {});

                expect(maquinas[0]).toMatchObject({
                    ultimoMotivo: 'Banda desgastada, se espera repuesto.',
                    ultimoCambioPor: { id: 'u1', nombre: 'Alberto', apellido: 'Ramírez' },
                });
            }
        });

        it('todos los roles reciben los datos públicos y la fecha estimada', async () => {
            const { maquinas } = await service.listar(Rol.MIEMBRO, {});

            expect(maquinas[0]).toMatchObject({
                id: 'm1',
                codigo: 'MAQ-001',
                nombre: 'Caminadora 1',
                tipo: TipoMaquina.CARDIO,
                zona: ZonaMaquina.PISO_1,
                estado: EstadoMaquina.EN_MANTENIMIENTO,
                fechaEstimadaRetorno: '2026-11-20',
            });
        });
    });

    describe('filtros y resumen', () => {
        it('pasa los tres filtros al listado', async () => {
            const filtros = {
                estado: EstadoMaquina.OPERATIVA,
                tipo: TipoMaquina.FUERZA,
                zona: ZonaMaquina.PISO_2,
            };

            await service.listar(Rol.MIEMBRO, filtros);

            expect(repo.findTodas).toHaveBeenCalledWith(filtros);
        });

        it('cuenta el resumen sin el filtro de estado, para no dejar los otros contadores en 0', async () => {
            await service.listar(Rol.MIEMBRO, {
                estado: EstadoMaquina.EN_MANTENIMIENTO,
                tipo: TipoMaquina.CARDIO,
                zona: ZonaMaquina.PISO_1,
            });

            expect(repo.contarPorEstado).toHaveBeenCalledWith({
                tipo: TipoMaquina.CARDIO,
                zona: ZonaMaquina.PISO_1,
            });
        });

        it('devuelve el resumen con los tres estados', async () => {
            const { resumen } = await service.listar(Rol.MIEMBRO, {});

            expect(resumen).toEqual(RESUMEN);
        });

        it('devuelve la lista vacía cuando ningún resultado cumple los filtros', async () => {
            repo.findTodas.mockResolvedValue([]);

            const { maquinas, resumen } = await service.listar(Rol.MIEMBRO, {
                zona: ZonaMaquina.AREA_FUNCIONAL,
            });

            expect(maquinas).toEqual([]);
            expect(resumen).toEqual(RESUMEN);
        });
    });
});
