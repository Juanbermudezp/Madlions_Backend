-- H8: tabla clase mínima para validar el traslape de los bloques de
-- disponibilidad con las clases PROGRAMADAS del entrenador. La historia de
-- clases grupales la amplía.

-- CreateEnum
CREATE TYPE "estado_clase" AS ENUM ('PROGRAMADA', 'CANCELADA');

-- CreateTable
CREATE TABLE "clase" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "entrenador_id" UUID NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fin" TIMESTAMP(3) NOT NULL,
    "estado" "estado_clase" NOT NULL DEFAULT 'PROGRAMADA',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clase_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "clase_horario_check" CHECK ("fin" > "inicio")
);

-- CreateIndex
CREATE INDEX "clase_entrenador_id_inicio_idx" ON "clase"("entrenador_id", "inicio");

-- AddForeignKey
ALTER TABLE "clase"
  ADD CONSTRAINT "clase_entrenador_id_fkey"
  FOREIGN KEY ("entrenador_id") REFERENCES "usuario"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;