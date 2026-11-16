-- Revierte H12: elimina comprobantes, intentos de pago y las columnas nuevas de
-- cobro, y devuelve los enum de cobro a los valores de H2.
--
-- PostgreSQL no permite quitar valores de un enum: cada tipo se recrea con sus
-- valores originales. Falla a propósito si hay cobros PAGADO, de sesión
-- adicional o con referencia SESION (no se pierden datos en silencio).
DROP TABLE "comprobante";
DROP TABLE "intento_pago";
DROP SEQUENCE "comprobante_numero_seq";
DROP TYPE "resultado_pago";

ALTER TABLE "cobro"
    DROP CONSTRAINT "cobro_detalle_check",
    DROP CONSTRAINT "cobro_pago_check",
    DROP CONSTRAINT "cobro_referencia_check",
    DROP COLUMN "detalle",
    DROP COLUMN "habilitado_desde",
    DROP COLUMN "pagado_en";

ALTER TYPE "concepto_cobro" RENAME TO "concepto_cobro_h12";
CREATE TYPE "concepto_cobro" AS ENUM ('MEMBRESIA', 'RENOVACION');
ALTER TABLE "cobro" ALTER COLUMN "concepto" TYPE "concepto_cobro" USING "concepto"::text::"concepto_cobro";
DROP TYPE "concepto_cobro_h12";

ALTER TYPE "referencia_cobro" RENAME TO "referencia_cobro_h12";
CREATE TYPE "referencia_cobro" AS ENUM ('MEMBRESIA');
ALTER TABLE "cobro" ALTER COLUMN "referencia_tipo" TYPE "referencia_cobro" USING "referencia_tipo"::text::"referencia_cobro";
DROP TYPE "referencia_cobro_h12";

ALTER TYPE "estado_cobro" RENAME TO "estado_cobro_h12";
CREATE TYPE "estado_cobro" AS ENUM ('PENDIENTE');
ALTER TABLE "cobro" ALTER COLUMN "estado" DROP DEFAULT;
ALTER TABLE "cobro" ALTER COLUMN "estado" TYPE "estado_cobro" USING "estado"::text::"estado_cobro";
ALTER TABLE "cobro" ALTER COLUMN "estado" SET DEFAULT 'PENDIENTE';
DROP TYPE "estado_cobro_h12";
