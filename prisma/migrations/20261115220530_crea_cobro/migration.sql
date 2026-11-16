-- Módulo 5 (base, creada por H2): cobros que el miembro paga desde su cuenta.
-- H2 los genera al registrar una compra o renovación de membresía; las
-- historias de pagos y sesiones agregan sus valores a los enum.

-- CreateEnum
CREATE TYPE "concepto_cobro" AS ENUM ('MEMBRESIA', 'RENOVACION');

-- CreateEnum
CREATE TYPE "referencia_cobro" AS ENUM ('MEMBRESIA');

-- CreateEnum
CREATE TYPE "estado_cobro" AS ENUM ('PENDIENTE');

-- CreateTable
CREATE TABLE "cobro" (
    "id" UUID NOT NULL,
    "miembro_id" UUID NOT NULL,
    "concepto" "concepto_cobro" NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "referencia_tipo" "referencia_cobro" NOT NULL,
    "referencia_id" UUID NOT NULL,
    "estado" "estado_cobro" NOT NULL DEFAULT 'PENDIENTE',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cobro_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cobro_monto_check" CHECK ("monto" > 0)
);

-- CreateIndex
CREATE INDEX "cobro_miembro_id_estado_idx" ON "cobro"("miembro_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "cobro_referencia_tipo_referencia_id_key" ON "cobro"("referencia_tipo", "referencia_id");

-- AddForeignKey
ALTER TABLE "cobro" ADD CONSTRAINT "cobro_miembro_id_fkey" FOREIGN KEY ("miembro_id") REFERENCES "miembro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
