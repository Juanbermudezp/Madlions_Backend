-- H8 (DB-8.1): crea la tabla de bloques de disponibilidad de los entrenadores.

-- CreateEnum
CREATE TYPE "estado_bloque" AS ENUM ('DISPONIBLE', 'OCUPADO');

-- CreateTable
CREATE TABLE "bloque_disponibilidad" (
    "id" UUID NOT NULL,
    "entrenador_id" UUID NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fin" TIMESTAMP(3) NOT NULL,
    "duracion_min" INTEGER NOT NULL,
    "estado" "estado_bloque" NOT NULL DEFAULT 'DISPONIBLE',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bloque_disponibilidad_pkey" PRIMARY KEY ("id"),
    -- Solo se permiten bloques de 45, 60 o 90 minutos.
    CONSTRAINT "bloque_disponibilidad_duracion_check"
      CHECK ("duracion_min" IN (45, 60, 90)),
    -- El fin siempre es el inicio más la duración: no pueden contradecirse.
    CONSTRAINT "bloque_disponibilidad_fin_check"
      CHECK ("fin" = "inicio" + make_interval(mins => "duracion_min"))
);

-- CreateIndex
-- Acelera las dos consultas de H8: el calendario semanal del entrenador y la
-- búsqueda de traslapes, que siempre filtran por entrenador y rango de inicio.
CREATE INDEX "bloque_disponibilidad_entrenador_id_inicio_idx"
  ON "bloque_disponibilidad"("entrenador_id", "inicio");

-- AddForeignKey
ALTER TABLE "bloque_disponibilidad"
  ADD CONSTRAINT "bloque_disponibilidad_entrenador_id_fkey"
  FOREIGN KEY ("entrenador_id") REFERENCES "usuario"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;