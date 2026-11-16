-- H12: amplía la tabla cobro (creada por H2 como base del Módulo 5) y crea los
-- intentos de pago y los comprobantes. Ninguna tabla guarda el número completo
-- de la tarjeta ni el código de seguridad: solo los últimos 4 dígitos.

-- CreateEnum
CREATE TYPE "resultado_pago" AS ENUM ('APROBADO', 'RECHAZADO', 'ERROR');

-- AlterEnum
ALTER TYPE "concepto_cobro" ADD VALUE 'SESION_ADICIONAL';

-- AlterEnum
ALTER TYPE "estado_cobro" ADD VALUE 'PAGADO';

-- AlterEnum
ALTER TYPE "referencia_cobro" ADD VALUE 'SESION';

-- AlterTable: detalle se agrega opcional, se completa en los cobros que ya
-- existen (el nombre del plan de su membresía) y después pasa a obligatorio.
ALTER TABLE "cobro" ADD COLUMN     "detalle" VARCHAR(150),
ADD COLUMN     "habilitado_desde" DATE,
ADD COLUMN     "pagado_en" TIMESTAMP(3);

UPDATE "cobro" AS c
SET "detalle" = m."nombre_plan"
FROM "membresia" AS m
WHERE c."referencia_tipo"::text = 'MEMBRESIA' AND m."id" = c."referencia_id";

-- Una renovación se puede pagar desde el vencimiento de la membresía que renueva (S3).
UPDATE "cobro" AS c
SET "habilitado_desde" = anterior."fecha_vencimiento"
FROM "membresia" AS m
JOIN "membresia" AS anterior ON anterior."id" = m."membresia_anterior_id"
WHERE c."concepto"::text = 'RENOVACION' AND c."referencia_tipo"::text = 'MEMBRESIA' AND m."id" = c."referencia_id";

UPDATE "cobro" SET "detalle" = 'Cobro' WHERE "detalle" IS NULL;
ALTER TABLE "cobro" ALTER COLUMN "detalle" SET NOT NULL;

-- Los valores nuevos de los enum se comparan como texto: PostgreSQL no deja
-- usarlos como enum en la misma transacción en que se agregan.
ALTER TABLE "cobro"
    ADD CONSTRAINT "cobro_detalle_check" CHECK (char_length(btrim("detalle")) >= 1),
    -- PENDIENTE no tiene fecha de pago; PAGADO siempre la tiene.
    ADD CONSTRAINT "cobro_pago_check" CHECK (
        ("estado"::text = 'PENDIENTE' AND "pagado_en" IS NULL)
        OR ("estado"::text = 'PAGADO' AND "pagado_en" IS NOT NULL)
    ),
    -- Una sesión adicional siempre apunta a una sesión, y solo ella.
    ADD CONSTRAINT "cobro_referencia_check" CHECK (
        ("concepto"::text = 'SESION_ADICIONAL') = ("referencia_tipo"::text = 'SESION')
    );

-- CreateTable
CREATE TABLE "intento_pago" (
    "id" UUID NOT NULL,
    "cobro_id" UUID NOT NULL,
    "resultado" "resultado_pago" NOT NULL,
    "mensaje" VARCHAR(100) NOT NULL,
    "ultimos4" CHAR(4) NOT NULL,
    "referencia" VARCHAR(22) NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intento_pago_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "intento_pago_mensaje_check" CHECK (char_length(btrim("mensaje")) >= 1),
    -- Solo los últimos 4 dígitos de la tarjeta.
    CONSTRAINT "intento_pago_ultimos4_check" CHECK ("ultimos4" ~ '^[0-9]{4}$'),
    CONSTRAINT "intento_pago_referencia_check" CHECK ("referencia" ~ '^PAY-[0-9]{8}-[A-Z0-9]{6}$')
);

-- CreateTable
CREATE TABLE "comprobante" (
    "id" UUID NOT NULL,
    "numero" VARCHAR(10) NOT NULL,
    "cobro_id" UUID NOT NULL,
    "intento_id" UUID NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "iva" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "emitido_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comprobante_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "comprobante_numero_check" CHECK ("numero" ~ '^CMP-[0-9]{6}$'),
    CONSTRAINT "comprobante_montos_check" CHECK (
        "subtotal" > 0 AND "iva" >= 0 AND "total" = "subtotal" + "iva"
    )
);

-- Números de comprobante: CMP-000001, CMP-000002, ... (los toma el servidor).
CREATE SEQUENCE "comprobante_numero_seq" START 1 MINVALUE 1 MAXVALUE 999999 NO CYCLE;

-- CreateIndex
CREATE UNIQUE INDEX "intento_pago_referencia_key" ON "intento_pago"("referencia");

-- CreateIndex
CREATE INDEX "intento_pago_cobro_id_idx" ON "intento_pago"("cobro_id");

-- CreateIndex
CREATE UNIQUE INDEX "comprobante_numero_key" ON "comprobante"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "comprobante_cobro_id_key" ON "comprobante"("cobro_id");

-- CreateIndex
CREATE UNIQUE INDEX "comprobante_intento_id_key" ON "comprobante"("intento_id");

-- AddForeignKey
ALTER TABLE "intento_pago" ADD CONSTRAINT "intento_pago_cobro_id_fkey" FOREIGN KEY ("cobro_id") REFERENCES "cobro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobante" ADD CONSTRAINT "comprobante_cobro_id_fkey" FOREIGN KEY ("cobro_id") REFERENCES "cobro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobante" ADD CONSTRAINT "comprobante_intento_id_fkey" FOREIGN KEY ("intento_id") REFERENCES "intento_pago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
