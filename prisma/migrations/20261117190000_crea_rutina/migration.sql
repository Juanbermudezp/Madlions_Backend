-- DB-14.1: solo crea objetos de rutinas. No modifica objetos de H16.
-- UUID y actualizado_en se proporcionan desde Prisma, como en Plan.
-- El rol del entrenador y los mínimos de hijos se validarán en BE-14.
BEGIN;

CREATE TABLE "rutina" (
    "id" UUID NOT NULL,
    "miembro_id" UUID NOT NULL,
    "entrenador_id" UUID NOT NULL,
    "nombre" VARCHAR(60) NOT NULL,
    "objetivo" VARCHAR(200) NOT NULL,
    "fecha_inicio" DATE NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rutina_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rutina_nombre_check" CHECK (char_length(btrim("nombre")) BETWEEN 3 AND 60),
    CONSTRAINT "rutina_objetivo_check" CHECK (char_length(btrim("objetivo")) BETWEEN 1 AND 200)
);

CREATE TABLE "rutina_dia" (
    "id" UUID NOT NULL,
    "rutina_id" UUID NOT NULL,
    "orden" INTEGER NOT NULL,
    "nombre" VARCHAR(40) NOT NULL,
    CONSTRAINT "rutina_dia_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rutina_dia_orden_check" CHECK ("orden" BETWEEN 1 AND 7),
    CONSTRAINT "rutina_dia_nombre_check" CHECK (char_length(btrim("nombre")) BETWEEN 1 AND 40)
);

CREATE TABLE "rutina_ejercicio" (
    "id" UUID NOT NULL,
    "dia_id" UUID NOT NULL,
    "orden" INTEGER NOT NULL,
    "nombre" VARCHAR(60) NOT NULL,
    "series" INTEGER NOT NULL,
    "repeticiones" INTEGER NOT NULL,
    "descanso_seg" INTEGER NOT NULL,
    CONSTRAINT "rutina_ejercicio_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rutina_ejercicio_orden_check" CHECK ("orden" BETWEEN 1 AND 15),
    CONSTRAINT "rutina_ejercicio_nombre_check" CHECK (char_length(btrim("nombre")) BETWEEN 1 AND 60),
    CONSTRAINT "rutina_ejercicio_series_check" CHECK ("series" BETWEEN 1 AND 10),
    CONSTRAINT "rutina_ejercicio_repeticiones_check" CHECK ("repeticiones" BETWEEN 1 AND 50),
    CONSTRAINT "rutina_ejercicio_descanso_seg_check" CHECK ("descanso_seg" BETWEEN 0 AND 600)
);

CREATE INDEX "rutina_miembro_id_fecha_inicio_idx" ON "rutina"("miembro_id", "fecha_inicio");
CREATE INDEX "rutina_entrenador_id_miembro_id_idx" ON "rutina"("entrenador_id", "miembro_id");
CREATE UNIQUE INDEX "rutina_dia_rutina_id_orden_key" ON "rutina_dia"("rutina_id", "orden");
CREATE UNIQUE INDEX "rutina_ejercicio_dia_id_orden_key" ON "rutina_ejercicio"("dia_id", "orden");

ALTER TABLE "rutina" ADD CONSTRAINT "rutina_miembro_id_fkey"
    FOREIGN KEY ("miembro_id") REFERENCES "miembro"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rutina" ADD CONSTRAINT "rutina_entrenador_id_fkey"
    FOREIGN KEY ("entrenador_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rutina_dia" ADD CONSTRAINT "rutina_dia_rutina_id_fkey"
    FOREIGN KEY ("rutina_id") REFERENCES "rutina"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rutina_ejercicio" ADD CONSTRAINT "rutina_ejercicio_dia_id_fkey"
    FOREIGN KEY ("dia_id") REFERENCES "rutina_dia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
