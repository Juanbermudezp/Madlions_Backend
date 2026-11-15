-- H17 (DB-17.1): inventario de máquinas del gimnasio con su estado operativo.
--
-- `ultimo_motivo` y `ultimo_cambio_por` guardan el último cambio de estado
-- para no consultar el historial (H18) al listar. Son datos internos: el
-- endpoint no los devuelve a miembros ni a recepción.

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
    -- Código del inventario: MAQ-001, MAQ-002, ...
    CONSTRAINT "maquina_codigo_check"
      CHECK ("codigo" ~ '^MAQ-[0-9]{3}$'),
    CONSTRAINT "maquina_nombre_check"
      CHECK (char_length(btrim("nombre")) BETWEEN 2 AND 60),
    -- El motivo del cambio de estado va de 5 a 250 caracteres (H18); nulo
    -- mientras la máquina no haya cambiado de estado nunca.
    CONSTRAINT "maquina_ultimo_motivo_check"
      CHECK ("ultimo_motivo" IS NULL
        OR char_length(btrim("ultimo_motivo")) BETWEEN 5 AND 250),
    -- Una máquina operativa no tiene retorno pendiente: al volver a
    -- OPERATIVA se borra la fecha estimada (H18).
    CONSTRAINT "maquina_fecha_estimada_retorno_check"
      CHECK ("estado" <> 'OPERATIVA' OR "fecha_estimada_retorno" IS NULL)
);

-- CreateIndex
CREATE UNIQUE INDEX "maquina_codigo_key" ON "maquina"("codigo");

-- AddForeignKey
-- SET NULL y no CASCADE: si se borra el usuario que hizo el último cambio, la
-- máquina y su estado siguen siendo válidos.
ALTER TABLE "maquina" ADD CONSTRAINT "maquina_ultimo_cambio_por_fkey" FOREIGN KEY ("ultimo_cambio_por") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
