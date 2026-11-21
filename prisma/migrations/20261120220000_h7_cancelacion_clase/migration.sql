-- DB-7.1: preparada manualmente; NO aplicada. Solo objetos de auditoría H7.
-- H16 NULLS NOT DISTINCT y CHECK manuales permanecen intactos.
BEGIN;

-- No inventar motivos, fechas ni administradores para cancelaciones antiguas.
-- Si existen, detener el despliegue y conciliar su auditoría con autorización.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "clase" WHERE "estado" = 'CANCELADA_GIMNASIO') THEN
        RAISE EXCEPTION 'DB-7.1: existen clases canceladas sin auditoría; conciliarlas antes de aplicar esta migración.';
    END IF;
END $$;

ALTER TABLE "clase"
    ADD COLUMN "motivo_cancelacion" VARCHAR(250),
    ADD COLUMN "cancelada_en" TIMESTAMP(3),
    ADD COLUMN "cancelada_por_id" UUID;

ALTER TABLE "clase" ADD CONSTRAINT "clase_cancelada_por_id_fkey"
    FOREIGN KEY ("cancelada_por_id") REFERENCES "usuario"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "clase" ADD CONSTRAINT "clase_cancelacion_check" CHECK (
    ("estado" = 'CANCELADA_GIMNASIO'
        AND "motivo_cancelacion" IS NOT NULL
        AND char_length(btrim("motivo_cancelacion")) BETWEEN 10 AND 250
        AND "cancelada_en" IS NOT NULL AND "cancelada_por_id" IS NOT NULL)
    OR
    ("estado" = 'PROGRAMADA' AND "motivo_cancelacion" IS NULL
        AND "cancelada_en" IS NULL AND "cancelada_por_id" IS NULL)
);
COMMIT;
