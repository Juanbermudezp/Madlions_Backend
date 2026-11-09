-- H1: planes que vende el gimnasio, tipos de clase que incluye cada plan y
-- configuración general con el precio de la clase puntual.

-- CreateEnum
CREATE TYPE "tipo_plan" AS ENUM ('DAYPASS', 'MENSUAL', 'SET_CLASES');

-- CreateTable
CREATE TABLE "plan" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(60) NOT NULL,
    "tipo" "tipo_plan" NOT NULL,
    "precio" DECIMAL(10,2) NOT NULL,
    "cantidad_clases" INTEGER,
    "duracion_dias" INTEGER NOT NULL,
    "beneficios" VARCHAR(500) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "plan_precio_check" CHECK ("precio" > 0),
    -- cantidad_clases: entre 1 y 100 en SET_CLASES; nula en los demás tipos.
    CONSTRAINT "plan_cantidad_clases_check" CHECK (
        ("tipo" = 'SET_CLASES' AND "cantidad_clases" IS NOT NULL
            AND "cantidad_clases" BETWEEN 1 AND 100)
        OR ("tipo" <> 'SET_CLASES' AND "cantidad_clases" IS NULL)
    ),
    -- duracion_dias: 1 en DAYPASS; 30 en los demás tipos.
    CONSTRAINT "plan_duracion_dias_check" CHECK (
        ("tipo" = 'DAYPASS' AND "duracion_dias" = 1)
        OR ("tipo" <> 'DAYPASS' AND "duracion_dias" = 30)
    )
);

-- CreateTable
CREATE TABLE "plan_tipo_clase" (
    "plan_id" UUID NOT NULL,
    "tipo_clase_id" UUID NOT NULL,

    CONSTRAINT "plan_tipo_clase_pkey" PRIMARY KEY ("plan_id","tipo_clase_id")
);

-- CreateTable
CREATE TABLE "configuracion" (
    "clave" VARCHAR(50) NOT NULL,
    "valor" VARCHAR(100) NOT NULL,
    "actualizado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "configuracion_pkey" PRIMARY KEY ("clave")
);

-- CreateIndex
CREATE UNIQUE INDEX "plan_nombre_key" ON "plan"("nombre");

-- AddForeignKey
ALTER TABLE "plan_tipo_clase" ADD CONSTRAINT "plan_tipo_clase_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_tipo_clase" ADD CONSTRAINT "plan_tipo_clase_tipo_clase_id_fkey" FOREIGN KEY ("tipo_clase_id") REFERENCES "tipo_clase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Datos: precio inicial de la clase puntual.
INSERT INTO "configuracion" ("clave", "valor") VALUES ('precio_clase_puntual', '10.00');
