-- Revierte DB-4.1 (H4): vuelve a la tabla clase mínima de H8.
ALTER TABLE "clase" ADD COLUMN "nombre" VARCHAR(80);

UPDATE "clase" AS c
SET "nombre" = t."nombre"
FROM "tipo_clase" AS t
WHERE t."id" = c."tipo_clase_id";

ALTER TABLE "clase" ALTER COLUMN "nombre" SET NOT NULL;
ALTER TABLE "clase" DROP CONSTRAINT "clase_tipo_clase_id_fkey";
DROP INDEX "clase_inicio_idx";
ALTER TYPE "estado_clase" RENAME VALUE 'CANCELADA_GIMNASIO' TO 'CANCELADA';
ALTER TABLE "clase" DROP CONSTRAINT "clase_cupo_maximo_check";
ALTER TABLE "clase"
    DROP COLUMN "cupo_maximo",
    DROP COLUMN "descripcion",
    DROP COLUMN "tipo_clase_id";
DROP TABLE "tipo_clase";
