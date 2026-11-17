-- H5 (DB-5.1): reservas de cupos en clases grupales, con su estado y su
-- asistencia.

-- CreateEnum
CREATE TYPE "estado_reserva" AS ENUM ('CONFIRMADA', 'CANCELADA_MIEMBRO', 'CANCELADA_GIMNASIO');

-- CreateEnum
CREATE TYPE "asistencia_reserva" AS ENUM ('SIN_REGISTRAR', 'ASISTIO', 'NO_ASISTIO');

-- CreateTable
CREATE TABLE "reserva" (
    "id" UUID NOT NULL,
    "clase_id" UUID NOT NULL,
    "miembro_id" UUID NOT NULL,
    "membresia_id" UUID NOT NULL,
    "estado" "estado_reserva" NOT NULL DEFAULT 'CONFIRMADA',
    "asistencia" "asistencia_reserva" NOT NULL DEFAULT 'SIN_REGISTRAR',
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelada_en" TIMESTAMP(3),

    CONSTRAINT "reserva_pkey" PRIMARY KEY ("id"),
    -- Una reserva confirmada no tiene fecha de cancelación; una cancelada sí.
    CONSTRAINT "reserva_cancelada_en_check" CHECK (
        ("estado" = 'CONFIRMADA' AND "cancelada_en" IS NULL)
        OR ("estado" <> 'CONFIRMADA' AND "cancelada_en" IS NOT NULL)
    )
);

-- CreateIndex
CREATE INDEX "reserva_clase_id_estado_idx" ON "reserva"("clase_id", "estado");

-- CreateIndex
CREATE INDEX "reserva_miembro_id_estado_idx" ON "reserva"("miembro_id", "estado");

-- CreateIndex
CREATE INDEX "reserva_membresia_id_estado_idx" ON "reserva"("membresia_id", "estado");

-- CreateIndex: una sola reserva CONFIRMADA por miembro y clase (índice único
-- parcial). Las canceladas no cuentan, para poder volver a reservar (H6).
CREATE UNIQUE INDEX "reserva_clase_miembro_confirmada_key" ON "reserva"("clase_id", "miembro_id")
    WHERE "estado" = 'CONFIRMADA';

-- AddForeignKey
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_clase_id_fkey" FOREIGN KEY ("clase_id") REFERENCES "clase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_miembro_id_fkey" FOREIGN KEY ("miembro_id") REFERENCES "miembro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_membresia_id_fkey" FOREIGN KEY ("membresia_id") REFERENCES "membresia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
