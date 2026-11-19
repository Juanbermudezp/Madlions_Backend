-- Revierte H19 (DB-19.1): quita el registro de quién y cuándo marcó la
-- asistencia. Al borrar las columnas se van con ellas su CHECK y su FK.
ALTER TABLE "sesion_personal"
    DROP COLUMN "asistencia_registrada_por",
    DROP COLUMN "asistencia_registrada_en";

ALTER TABLE "reserva"
    DROP COLUMN "asistencia_registrada_por",
    DROP COLUMN "asistencia_registrada_en";
