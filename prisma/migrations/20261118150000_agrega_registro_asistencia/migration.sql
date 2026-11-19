-- H19 (DB-19.1): quién y cuándo registró la asistencia, en las reservas de
-- clases (H5) y en las sesiones personales (H9). La columna `asistencia` ya
-- existía en las dos tablas.
--
-- Las columnas nuevas son nulas, así que las filas que ya están no cambian.

-- AlterTable
ALTER TABLE "reserva"
    ADD COLUMN "asistencia_registrada_por" UUID,
    ADD COLUMN "asistencia_registrada_en" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "sesion_personal"
    ADD COLUMN "asistencia_registrada_por" UUID,
    ADD COLUMN "asistencia_registrada_en" TIMESTAMP(3);

-- La asistencia y su registro van juntos: o no hay marca y no hay quién ni
-- cuándo, o hay marca y están los dos.
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_asistencia_registro_check" CHECK (
    ("asistencia" = 'SIN_REGISTRAR'
        AND "asistencia_registrada_por" IS NULL
        AND "asistencia_registrada_en" IS NULL)
    OR ("asistencia" <> 'SIN_REGISTRAR'
        AND "asistencia_registrada_por" IS NOT NULL
        AND "asistencia_registrada_en" IS NOT NULL)
);

ALTER TABLE "sesion_personal" ADD CONSTRAINT "sesion_personal_asistencia_registro_check" CHECK (
    ("asistencia" = 'SIN_REGISTRAR'
        AND "asistencia_registrada_por" IS NULL
        AND "asistencia_registrada_en" IS NULL)
    OR ("asistencia" <> 'SIN_REGISTRAR'
        AND "asistencia_registrada_por" IS NOT NULL
        AND "asistencia_registrada_en" IS NOT NULL)
);

-- AddForeignKey: RESTRICT y no SET NULL, porque dejar la marca sin autor
-- rompería el CHECK de arriba (los usuarios se desactivan, no se borran).
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_asistencia_registrada_por_fkey" FOREIGN KEY ("asistencia_registrada_por") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesion_personal" ADD CONSTRAINT "sesion_personal_asistencia_registrada_por_fkey" FOREIGN KEY ("asistencia_registrada_por") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
