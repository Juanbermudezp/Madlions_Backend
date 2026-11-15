import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { CobrosService } from '@Cobros/services';
import { hoyLocal } from '@Common/fechas';
import { MembresiaRepository, type MiembroDeRegistro } from '@Membresias/repositories';
import { MembresiaPendienteError } from '@Membresias/errors';
import type {
    MembresiaRegistradaResponseDto,
    OperacionMembresiaDto,
    ResumenMembresiaResponseDto,
} from '@Membresias/dto';
import { PlanRepository, type PlanConTiposClase } from '@Planes/repositories';
import {
    ConceptoCobro,
    ReferenciaCobro,
    TipoOperacionMembresia,
} from '@PrismaClient';
import { determinarOperacion, type OperacionMembresia } from './reglas-operacion.js';

export const MIEMBRO_NO_EXISTE = 'El miembro no existe.';
export const PLAN_NO_EXISTE = 'El plan no existe.';
export const PLAN_INACTIVO = 'El plan está inactivo.';
export const OPERACION_PENDIENTE = 'El miembro ya tiene una compra o renovación pendiente de pago';

interface OperacionPreparada {
    miembro: MiembroDeRegistro;
    plan: PlanConTiposClase;
    operacion: OperacionMembresia;
}

/** Registro de compras y renovaciones de membresía (H2, BE-2.3). */
@Injectable()
export class RegistroMembresiaService {
    constructor(
        private readonly membresiaRepository: MembresiaRepository,
        private readonly planRepository: PlanRepository,
        private readonly cobrosService: CobrosService,
    ) { }

    /** GET /membresias/resumen: valida lo mismo que el registro, sin guardar nada. */
    async resumen(dto: OperacionMembresiaDto, hoy: string = hoyLocal()): Promise<ResumenMembresiaResponseDto> {
        const { miembro, plan, operacion } = await this.preparar(dto, hoy);
        return {
            miembro: {
                id: miembro.id,
                nombre: miembro.usuario.nombre,
                apellido: miembro.usuario.apellido,
                codigo: miembro.codigoMiembro,
            },
            plan: {
                id: plan.id,
                nombre: plan.nombre,
                tipo: plan.tipo,
                cantidadClases: plan.cantidadClases,
                tiposClase: plan.tiposClase.map(({ tipoClase }) => tipoClase),
            },
            precio: plan.precio.toNumber(),
            beneficios: plan.beneficios,
            duracionDias: plan.duracionDias,
            tipoOperacion: operacion.tipoOperacion,
            fechaInicio: operacion.fechaInicio,
            fechaVencimiento: operacion.fechaVencimiento,
            fechaInicioFija: operacion.fechaInicioFija,
        };
    }

    /**
     * POST /membresias: guarda la membresía PENDIENTE_PAGO con la copia de las
     * condiciones del plan y, en la misma transacción, pide el cobro al
     * Módulo 5. Si el cobro falla, no queda la membresía.
     */
    async registrar(
        dto: OperacionMembresiaDto,
        registradaPorId: string,
        hoy: string = hoyLocal(),
    ): Promise<MembresiaRegistradaResponseDto> {
        const { plan, operacion } = await this.preparar(dto, hoy);

        try {
            const { membresia, cobro } = await this.membresiaRepository.registrarConCobro(
                {
                    miembroId: dto.miembroId,
                    planId: plan.id,
                    nombrePlan: plan.nombre,
                    tipoPlan: plan.tipo,
                    precio: plan.precio,
                    cantidadClases: plan.cantidadClases,
                    tipoOperacion: operacion.tipoOperacion,
                    membresiaAnteriorId: operacion.membresiaAnteriorId,
                    fechaInicioSolicitada: new Date(`${operacion.fechaInicio}T00:00:00Z`),
                    registradaPorId,
                },
                plan.tiposClase.map(({ tipoClase }) => tipoClase.id),
                (tx, membresiaId) =>
                    this.cobrosService.crearCobro(
                        {
                            miembroId: dto.miembroId,
                            concepto:
                                operacion.tipoOperacion === TipoOperacionMembresia.RENOVACION
                                    ? ConceptoCobro.RENOVACION
                                    : ConceptoCobro.MEMBRESIA,
                            monto: plan.precio,
                            referenciaTipo: ReferenciaCobro.MEMBRESIA,
                            referenciaId: membresiaId,
                        },
                        tx,
                    ),
            );

            return {
                id: membresia.id,
                tipoOperacion: membresia.tipoOperacion,
                estado: membresia.estado,
                plan: { id: plan.id, nombre: membresia.nombrePlan, tipo: membresia.tipoPlan },
                precio: membresia.precio.toNumber(),
                cobroId: cobro.id,
            };
        } catch (error) {
            if (error instanceof MembresiaPendienteError) throw new ConflictException(OPERACION_PENDIENTE);
            throw error;
        }
    }

    /** Validaciones comunes del resumen y del registro. */
    private async preparar(dto: OperacionMembresiaDto, hoy: string): Promise<OperacionPreparada> {
        const [miembro, plan] = await Promise.all([
            this.membresiaRepository.findMiembro(dto.miembroId),
            this.planRepository.findById(dto.planId),
        ]);
        if (!miembro) throw new NotFoundException(MIEMBRO_NO_EXISTE);
        if (!plan) throw new NotFoundException(PLAN_NO_EXISTE);
        if (!plan.activo) throw new ConflictException(PLAN_INACTIVO);
        if (await this.membresiaRepository.tienePendiente(miembro.id)) {
            throw new ConflictException(OPERACION_PENDIENTE);
        }

        const resultado = determinarOperacion({
            tipoPlan: plan.tipo,
            duracionDias: plan.duracionDias,
            pagadasDelPlan: await this.membresiaRepository.findPagadasDelPlan(miembro.id, plan.id),
            hoy,
            fechaSolicitada: dto.fechaInicio,
        });
        if (!resultado.ok) throw new BadRequestException(resultado.error);

        return { miembro, plan, operacion: resultado.operacion };
    }
}
