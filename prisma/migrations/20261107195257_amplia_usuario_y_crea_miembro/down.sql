-- Revierte DB-30.1. Ejecutar antes del down.sql de agrega_rol_y_nombre_al_usuario.
DROP TABLE "miembro";
DROP SEQUENCE "miembro_codigo_seq";

ALTER TABLE "usuario"
  DROP CONSTRAINT "usuario_nombre_check",
  DROP CONSTRAINT "usuario_apellido_check",
  DROP CONSTRAINT "usuario_telefono_check",
  DROP COLUMN "apellido",
  DROP COLUMN "telefono",
  ALTER COLUMN "nombre" SET DATA TYPE TEXT;

ALTER TABLE "usuario" RENAME COLUMN "activo" TO "is_active";
ALTER INDEX "usuario_email_key" RENAME TO "users_email_key";
ALTER TABLE "usuario" RENAME CONSTRAINT "usuario_pkey" TO "users_pkey";
ALTER TABLE "usuario" RENAME TO "users";