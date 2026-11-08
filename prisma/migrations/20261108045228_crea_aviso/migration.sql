-- H22 (DB-22.1): crea la tabla de avisos de los miembros (Módulo 9).
-- Solo la escribe AvisosService (BE-22.1); no existe endpoint para crear avisos.

-- CreateEnum
CREATE TYPE "modulo_origen" AS ENUM ('MEMBRESIAS', 'CLASES', 'SESIONES', 'PAGOS');

-- CreateEnum
CREATE TYPE "estado_aviso" AS ENUM ('NO_LEIDO', 'LEIDO');

-- CreateTable
CREATE TABLE "aviso" (
    "id" UUID NOT NULL,
    "miembro_id" UUID NOT NULL,
    "titulo" VARCHAR(100) NOT NULL,
    "mensaje" VARCHAR(500) NOT NULL,
    "modulo_origen" "modulo_origen" NOT NULL,
    "referencia" VARCHAR(100),
    "estado" "estado_aviso" NOT NULL DEFAULT 'NO_LEIDO',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leido_en" TIMESTAMP(3),

    CONSTRAINT "aviso_pkey" PRIMARY KEY ("id"),
    -- El largo máximo lo da VARCHAR; estos CHECK impiden textos vacíos o de
    -- solo espacios (H22: título de 1 a 100 y mensaje de 1 a 500 caracteres).
    CONSTRAINT "aviso_titulo_check"
      CHECK (char_length(btrim("titulo")) >= 1),
    CONSTRAINT "aviso_mensaje_check"
      CHECK (char_length(btrim("mensaje")) >= 1),
    CONSTRAINT "aviso_referencia_check"
      CHECK ("referencia" IS NULL OR char_length(btrim("referencia")) >= 1),
    -- Un aviso LEIDO siempre tiene fecha de lectura y uno NO_LEIDO nunca.
    CONSTRAINT "aviso_leido_en_check"
      CHECK (("estado" = 'LEIDO') = ("leido_en" IS NOT NULL))
);

-- CreateIndex
-- Bandeja del miembro (H23): sus avisos ordenados por fecha.
CREATE INDEX "aviso_miembro_id_creado_en_idx" ON "aviso"("miembro_id", "creado_en");

-- CreateIndex
-- Contador de no leídos (H23, BE-23.1: menos de 200 ms).
CREATE INDEX "aviso_miembro_id_estado_idx" ON "aviso"("miembro_id", "estado");

-- CreateIndex
-- Deduplicación por referencia (H22). PostgreSQL trata cada NULL como distinto
-- en un índice único, así que los avisos sin referencia nunca chocan: equivale
-- al índice parcial "WHERE referencia IS NOT NULL" y Prisma lo conoce, por lo
-- que ninguna migración futura intentará borrarlo.
CREATE UNIQUE INDEX "aviso_miembro_id_referencia_key" ON "aviso"("miembro_id", "referencia");

-- AddForeignKey
-- Si se elimina la ficha del miembro, sus avisos se eliminan con ella.
ALTER TABLE "aviso"
  ADD CONSTRAINT "aviso_miembro_id_fkey"
  FOREIGN KEY ("miembro_id") REFERENCES "miembro"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
