-- H17 (DB-17.1): inventario de máquinas del gimnasio con su estado operativo.

-- CreateEnum
CREATE TYPE "tipo_maquina" AS ENUM ('CARDIO', 'FUERZA', 'PESO_LIBRE', 'FUNCIONAL');

-- CreateEnum
CREATE TYPE "zona_maquina" AS ENUM ('PISO_1', 'PISO_2', 'AREA_FUNCIONAL');

-- CreateEnum
CREATE TYPE "estado_maquina" AS ENUM ('OPERATIVA', 'EN_MANTENIMIENTO', 'FUERA_DE_SERVICIO');

-- CreateTable
CREATE TABLE "maquina" (
    "id" UUID NOT NULL,
    "codigo" VARCHAR(10) NOT NULL,
    "nombre" VARCHAR(60) NOT NULL,
    "tipo" "tipo_maquina" NOT NULL,
    "zona" "zona_maquina" NOT NULL,
    "estado" "estado_maquina" NOT NULL DEFAULT 'OPERATIVA',
    "fecha_estimada_retorno" DATE,
    "ultimo_motivo" VARCHAR(250),
    "ultimo_cambio_por" UUID,
    "actualizado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maquina_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "maquina_codigo_check"
      CHECK ("codigo" ~ '^MAQ-[0-9]{3}$'),
    CONSTRAINT "maquina_nombre_check"
      CHECK (char_length(btrim("nombre")) BETWEEN 2 AND 60),
    CONSTRAINT "maquina_ultimo_motivo_check"
      CHECK ("ultimo_motivo" IS NULL
        OR char_length(btrim("ultimo_motivo")) BETWEEN 5 AND 250),
    CONSTRAINT "maquina_fecha_estimada_retorno_check"
      CHECK ("estado" <> 'OPERATIVA' OR "fecha_estimada_retorno" IS NULL)
);

-- CreateIndex
CREATE UNIQUE INDEX "maquina_codigo_key" ON "maquina"("codigo");

-- AddForeignKey
ALTER TABLE "maquina" ADD CONSTRAINT "maquina_ultimo_cambio_por_fkey" FOREIGN KEY ("ultimo_cambio_por") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
