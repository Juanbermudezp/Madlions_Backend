import type { PrismaService } from '@Prisma/services';
import { EstadoClase, Rol } from '@PrismaClient';

/** Compatibilidad de fixtures e2e existentes con DB-7.1. Solo se llama desde
 * pruebas que ya requieren BD QA autorizada; no se ejecuta al importar.
 */
export async function auditoriaClaseFixture(prisma: Pick<PrismaService, 'user'>, estado: EstadoClase) {
    if (estado !== EstadoClase.CANCELADA_GIMNASIO) return {};
    const admin = await prisma.user.findFirstOrThrow({ where: { rol: Rol.ADMINISTRADOR }, select: { id: true } });
    return { motivoCancelacion: 'Cancelación de clase de prueba.', canceladaEn: new Date(), canceladaPorId: admin.id };
}
