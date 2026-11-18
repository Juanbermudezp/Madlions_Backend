-- CreateEnum
CREATE TYPE "estado_sesion" AS ENUM ('AGENDADA');

-- CreateEnum
CREATE TYPE "asistencia_sesion" AS ENUM ('SIN_REGISTRAR', 'ASISTIO', 'NO_ASISTIO');

-- CreateTable
CREATE TABLE "sesion_personal" (
    "id" UUID NOT NULL,
    "bloque_id" UUID NOT NULL,
    "miembro_id" UUID NOT NULL,
    "entrenador_id" UUID NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fin" TIMESTAMP(3) NOT NULL,
    "precio" DECIMAL(10,2) NOT NULL,
    "cobro_id" UUID,
    "estado" "estado_sesion" NOT NULL DEFAULT 'AGENDADA',
    "asistencia" "asistencia_sesion" NOT NULL DEFAULT 'SIN_REGISTRAR',
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sesion_personal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sesion_personal_horario_check" CHECK ("fin" > "inicio"),
    -- Mismo criterio que el precio de los planes y de la clase puntual (H1).
    CONSTRAINT "sesion_personal_precio_check" CHECK ("precio" > 0)
);

-- CreateIndex
-- Un bloque solo puede tener una sesión: si dos miembros confirman el mismo
-- bloque al mismo tiempo, la base rechaza el segundo INSERT.
CREATE UNIQUE INDEX "sesion_personal_bloque_id_key" ON "sesion_personal"("bloque_id");

-- CreateIndex
-- Un cobro corresponde a una sola sesión.
CREATE UNIQUE INDEX "sesion_personal_cobro_id_key" ON "sesion_personal"("cobro_id");

-- CreateIndex
-- "Mis sesiones", el límite de 5 sesiones pendientes y el traslape del miembro.
CREATE INDEX "sesion_personal_miembro_id_inicio_idx" ON "sesion_personal"("miembro_id", "inicio");

-- CreateIndex
-- Agenda del entrenador.
CREATE INDEX "sesion_personal_entrenador_id_inicio_idx" ON "sesion_personal"("entrenador_id", "inicio");

-- AddForeignKey
ALTER TABLE "sesion_personal"
    ADD CONSTRAINT "sesion_personal_bloque_id_fkey"
    FOREIGN KEY ("bloque_id") REFERENCES "bloque_disponibilidad"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesion_personal"
    ADD CONSTRAINT "sesion_personal_miembro_id_fkey"
    FOREIGN KEY ("miembro_id") REFERENCES "miembro"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesion_personal"
    ADD CONSTRAINT "sesion_personal_entrenador_id_fkey"
    FOREIGN KEY ("entrenador_id") REFERENCES "usuario"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;