-- H10 (DB-10.1): crea la tabla de registros de ingreso y salida.

-- CreateEnum
CREATE TYPE "estado_acceso" AS ENUM ('DENTRO', 'SALIO', 'CERRADO_AUTO');

-- CreateTable
CREATE TABLE "registro_acceso" (
    "id" UUID NOT NULL,
    "miembro_id" UUID NOT NULL,
    "ingreso_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "salida_en" TIMESTAMP(3),
    "estado" "estado_acceso" NOT NULL DEFAULT 'DENTRO',
    "registrado_por" UUID NOT NULL,
    "salida_registrada_por" UUID,
    "estado_membresia" VARCHAR(30) NOT NULL,
    "motivo_excepcion" VARCHAR(250),

    CONSTRAINT "registro_acceso_pkey" PRIMARY KEY ("id"),
    -- Coherencia entre el estado y la salida:
    -- DENTRO sin salida; SALIO con hora y usuario de salida;
    -- CERRADO_AUTO con hora de salida y sin usuario (lo cierra el sistema).
    CONSTRAINT "registro_acceso_estado_check" CHECK (
        ("estado" = 'DENTRO' AND "salida_en" IS NULL AND "salida_registrada_por" IS NULL)
        OR ("estado" = 'SALIO' AND "salida_en" IS NOT NULL AND "salida_registrada_por" IS NOT NULL)
        OR ("estado" = 'CERRADO_AUTO' AND "salida_en" IS NOT NULL AND "salida_registrada_por" IS NULL)
    ),
    CONSTRAINT "registro_acceso_salida_check" CHECK ("salida_en" IS NULL OR "salida_en" >= "ingreso_en")
);

-- CreateIndex
CREATE INDEX "registro_acceso_miembro_id_estado_idx" ON "registro_acceso"("miembro_id", "estado");

-- CreateIndex
-- Lista del día (GET /accesos/hoy) y cierre automático de las 23:59.
CREATE INDEX "registro_acceso_ingreso_en_idx" ON "registro_acceso"("ingreso_en");

-- CreateIndex
-- Un solo ingreso abierto por miembro: un segundo DENTRO para el mismo
-- miembro falla aunque dos recepcionistas lo registren al mismo tiempo.
-- Prisma no soporta índices parciales, por eso no está en schema.prisma.
CREATE UNIQUE INDEX "registro_acceso_miembro_dentro_key"
    ON "registro_acceso"("miembro_id")
    WHERE "estado" = 'DENTRO';

-- AddForeignKey
ALTER TABLE "registro_acceso"
    ADD CONSTRAINT "registro_acceso_miembro_id_fkey"
    FOREIGN KEY ("miembro_id") REFERENCES "miembro"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registro_acceso"
    ADD CONSTRAINT "registro_acceso_registrado_por_fkey"
    FOREIGN KEY ("registrado_por") REFERENCES "usuario"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registro_acceso"
    ADD CONSTRAINT "registro_acceso_salida_registrada_por_fkey"
    FOREIGN KEY ("salida_registrada_por") REFERENCES "usuario"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;