-- H2: membresías compradas o renovadas, con una copia de las condiciones del
-- plan al momento de la compra, y los tipos de clase que incluyen.

-- CreateEnum
CREATE TYPE "tipo_operacion_membresia" AS ENUM ('COMPRA', 'RENOVACION');

-- CreateEnum
CREATE TYPE "estado_membresia" AS ENUM ('PENDIENTE_PAGO', 'PAGADA');

-- CreateTable
CREATE TABLE "membresia" (
    "id" UUID NOT NULL,
    "miembro_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "nombre_plan" VARCHAR(60) NOT NULL,
    "tipo_plan" "tipo_plan" NOT NULL,
    "precio" DECIMAL(10,2) NOT NULL,
    "cantidad_clases" INTEGER,
    "tipo_operacion" "tipo_operacion_membresia" NOT NULL,
    "membresia_anterior_id" UUID,
    "estado" "estado_membresia" NOT NULL DEFAULT 'PENDIENTE_PAGO',
    "fecha_inicio_solicitada" DATE NOT NULL,
    "fecha_inicio" DATE,
    "fecha_vencimiento" DATE,
    "registrada_por" UUID NOT NULL,
    "pago_aplicado_ref" VARCHAR(100),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membresia_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "membresia_precio_check" CHECK ("precio" > 0),
    -- cantidad_clases: entre 1 y 100 en SET_CLASES; nula en los demás tipos.
    CONSTRAINT "membresia_cantidad_clases_check" CHECK (
        ("tipo_plan" = 'SET_CLASES' AND "cantidad_clases" IS NOT NULL
            AND "cantidad_clases" BETWEEN 1 AND 100)
        OR ("tipo_plan" <> 'SET_CLASES' AND "cantidad_clases" IS NULL)
    ),
    -- Las fechas de vigencia son nulas hasta el pago y se fijan al pagar.
    CONSTRAINT "membresia_fechas_check" CHECK (
        ("estado" = 'PENDIENTE_PAGO' AND "fecha_inicio" IS NULL AND "fecha_vencimiento" IS NULL)
        OR ("estado" = 'PAGADA' AND "fecha_inicio" IS NOT NULL AND "fecha_vencimiento" IS NOT NULL
            AND "fecha_vencimiento" >= "fecha_inicio")
    ),
    -- Una renovación siempre apunta a la membresía que renueva, y nunca a sí misma.
    CONSTRAINT "membresia_renovacion_check" CHECK (
        ("tipo_operacion" <> 'RENOVACION' OR "membresia_anterior_id" IS NOT NULL)
        AND ("membresia_anterior_id" IS NULL OR "membresia_anterior_id" <> "id")
    )
);

-- CreateTable
CREATE TABLE "membresia_tipo_clase" (
    "membresia_id" UUID NOT NULL,
    "tipo_clase_id" UUID NOT NULL,

    CONSTRAINT "membresia_tipo_clase_pkey" PRIMARY KEY ("membresia_id","tipo_clase_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "membresia_pago_aplicado_ref_key" ON "membresia"("pago_aplicado_ref");

-- CreateIndex
CREATE INDEX "membresia_miembro_id_estado_idx" ON "membresia"("miembro_id", "estado");

-- CreateIndex: una sola membresía PENDIENTE_PAGO por miembro (índice único parcial).
CREATE UNIQUE INDEX "membresia_miembro_pendiente_pago_key" ON "membresia"("miembro_id")
    WHERE "estado" = 'PENDIENTE_PAGO';

-- AddForeignKey
ALTER TABLE "membresia" ADD CONSTRAINT "membresia_miembro_id_fkey" FOREIGN KEY ("miembro_id") REFERENCES "miembro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresia" ADD CONSTRAINT "membresia_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresia" ADD CONSTRAINT "membresia_membresia_anterior_id_fkey" FOREIGN KEY ("membresia_anterior_id") REFERENCES "membresia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresia" ADD CONSTRAINT "membresia_registrada_por_fkey" FOREIGN KEY ("registrada_por") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresia_tipo_clase" ADD CONSTRAINT "membresia_tipo_clase_membresia_id_fkey" FOREIGN KEY ("membresia_id") REFERENCES "membresia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresia_tipo_clase" ADD CONSTRAINT "membresia_tipo_clase_tipo_clase_id_fkey" FOREIGN KEY ("tipo_clase_id") REFERENCES "tipo_clase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
