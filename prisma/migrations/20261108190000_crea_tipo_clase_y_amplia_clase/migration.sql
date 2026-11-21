-- H4 (DB-4.1): catálogo de tipos de clase y ampliación de la tabla clase que
-- creó H8. Las clases que ya existen se convierten: cada nombre distinto pasa
-- a ser un tipo de clase y cada clase queda enlazada a su tipo.

-- CreateTable
CREATE TABLE "tipo_clase" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(40) NOT NULL,
    "descripcion" VARCHAR(300) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tipo_clase_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tipo_clase_nombre_check" CHECK (char_length(btrim("nombre")) BETWEEN 2 AND 40)
);

-- CreateIndex
CREATE UNIQUE INDEX "tipo_clase_nombre_key" ON "tipo_clase"("nombre");

-- Datos: un tipo de clase por cada nombre de clase existente.
INSERT INTO "tipo_clase" ("id", "nombre", "descripcion")
SELECT gen_random_uuid(), n."nombre", 'Tipo de clase ' || n."nombre"
FROM (SELECT DISTINCT LEFT(btrim("nombre"), 40) AS "nombre" FROM "clase") AS n;

-- AlterTable: cada clase apunta a su tipo y deja de guardar el nombre suelto.
ALTER TABLE "clase" ADD COLUMN "tipo_clase_id" UUID;

UPDATE "clase" AS c
SET "tipo_clase_id" = t."id"
FROM "tipo_clase" AS t
WHERE t."nombre" = LEFT(btrim(c."nombre"), 40);

ALTER TABLE "clase" ALTER COLUMN "tipo_clase_id" SET NOT NULL;
ALTER TABLE "clase" DROP COLUMN "nombre";

-- AlterTable: descripción opcional y cupo máximo (las clases existentes quedan
-- con cupo 20; las nuevas siempre lo reciben desde la API).
ALTER TABLE "clase"
    ADD COLUMN "descripcion" VARCHAR(300),
    ADD COLUMN "cupo_maximo" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "clase" ALTER COLUMN "cupo_maximo" DROP DEFAULT;
ALTER TABLE "clase"
    ADD CONSTRAINT "clase_cupo_maximo_check" CHECK ("cupo_maximo" BETWEEN 1 AND 50);

-- El estado de cancelación usa el nombre del documento de historias.
ALTER TYPE "estado_clase" RENAME VALUE 'CANCELADA' TO 'CANCELADA_GIMNASIO';

-- CreateIndex
CREATE INDEX "clase_inicio_idx" ON "clase"("inicio");

-- AddForeignKey
ALTER TABLE "clase"
  ADD CONSTRAINT "clase_tipo_clase_id_fkey"
  FOREIGN KEY ("tipo_clase_id") REFERENCES "tipo_clase"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
