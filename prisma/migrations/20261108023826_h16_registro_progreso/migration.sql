-- CreateEnum
CREATE TYPE "tipo_progreso" AS ENUM ('PESO', 'CINTURA', 'CADERA', 'PECHO', 'BRAZO', 'MUSLO', 'MARCA');

-- CreateTable
CREATE TABLE "registro_progreso" (
    "id" UUID NOT NULL,
    "miembro_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "tipo" "tipo_progreso" NOT NULL,
    "valor" DECIMAL(5,1) NOT NULL,
    "ejercicio" VARCHAR(60),
    "repeticiones" INTEGER,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registro_progreso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "registro_progreso_miembro_id_fecha_idx" ON "registro_progreso"("miembro_id", "fecha");

-- AddForeignKey
ALTER TABLE "registro_progreso" ADD CONSTRAINT "registro_progreso_miembro_id_fkey" FOREIGN KEY ("miembro_id") REFERENCES "miembro"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Evitar mediciones duplicadas.
CREATE UNIQUE INDEX "registro_progreso_medicion_unique"
ON "registro_progreso" (
    "miembro_id",
    "fecha",
    "tipo",
    "ejercicio",
    "repeticiones"
) NULLS NOT DISTINCT;

-- Validar valores positivos y rangos.
ALTER TABLE "registro_progreso"
ADD CONSTRAINT "registro_progreso_valor_check"
CHECK (
    ("tipo" = 'PESO' AND "valor" BETWEEN 20.0 AND 300.0)
    OR
    ("tipo" IN ('CINTURA', 'CADERA', 'PECHO', 'BRAZO', 'MUSLO')
        AND "valor" BETWEEN 10.0 AND 250.0)
    OR
    ("tipo" = 'MARCA' AND "valor" BETWEEN 0.5 AND 500.0)
);

-- Ejercicio y repeticiones solo para marcas.
ALTER TABLE "registro_progreso"
ADD CONSTRAINT "registro_progreso_marca_check"
CHECK (
    (
        "tipo" = 'MARCA'
        AND "ejercicio" IS NOT NULL
        AND length(btrim("ejercicio")) BETWEEN 1 AND 60
        AND "repeticiones" IS NOT NULL
        AND "repeticiones" BETWEEN 1 AND 100
    )
    OR
    (
        "tipo" <> 'MARCA'
        AND "ejercicio" IS NULL
        AND "repeticiones" IS NULL
    )
);
