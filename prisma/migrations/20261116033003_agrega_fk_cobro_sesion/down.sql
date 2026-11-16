-- Revierte la FK de BE-9.2.
ALTER TABLE "sesion_personal" DROP CONSTRAINT "sesion_personal_cobro_id_fkey";