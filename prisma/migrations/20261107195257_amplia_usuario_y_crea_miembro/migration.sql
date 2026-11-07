-- H30 (DB-30.1): amplía la tabla de usuarios y crea la tabla de miembros.
-- Ninguna instrucción borra datos: la tabla y la columna se renombran.

-- 1. users -> usuario, is_active -> activo
-- Se renombran también la PK y el índice único con los nombres que Prisma
-- espera para la tabla nueva; si no, la siguiente migración los vería como
-- un cambio pendiente.
ALTER TABLE "users" RENAME TO "usuario";
ALTER TABLE "usuario" RENAME CONSTRAINT "users_pkey" TO "usuario_pkey";
ALTER INDEX "users_email_key" RENAME TO "usuario_email_key";
ALTER TABLE "usuario" RENAME COLUMN "is_active" TO "activo";

-- 2. nombre a 50 caracteres; apellido y teléfono nuevos
-- Los usuarios que ya existen reciben valores temporales válidos y después se
-- quita el default, para que el esquema coincida con schema.prisma.
ALTER TABLE "usuario"
  ALTER COLUMN "nombre" SET DATA TYPE VARCHAR(50),
  ADD COLUMN "apellido" VARCHAR(50) NOT NULL DEFAULT 'Sin apellido',
  ADD COLUMN "telefono" CHAR(8) NOT NULL DEFAULT '00000000';

ALTER TABLE "usuario"
  ALTER COLUMN "apellido" DROP DEFAULT,
  ALTER COLUMN "telefono" DROP DEFAULT;

ALTER TABLE "usuario"
  ADD CONSTRAINT "usuario_nombre_check"
    CHECK (char_length(btrim("nombre")) BETWEEN 2 AND 50),
  ADD CONSTRAINT "usuario_apellido_check"
    CHECK (char_length(btrim("apellido")) BETWEEN 2 AND 50),
  ADD CONSTRAINT "usuario_telefono_check"
    CHECK ("telefono" ~ '^[0-9]{8}$');

-- 3. Tabla miembro
-- La secuencia alimenta codigo_miembro (MBR-000001, MBR-000002, ...).
CREATE SEQUENCE "miembro_codigo_seq" START 1;

CREATE TABLE "miembro" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "documento" CHAR(10) NOT NULL,
    "codigo_miembro" CHAR(10) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "miembro_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "miembro_documento_check"
      CHECK ("documento" ~ '^[0-9]{8}-[0-9]$'),
    CONSTRAINT "miembro_codigo_miembro_check"
      CHECK ("codigo_miembro" ~ '^MBR-[0-9]{6}$')
);

CREATE UNIQUE INDEX "miembro_usuario_id_key" ON "miembro"("usuario_id");
CREATE UNIQUE INDEX "miembro_documento_key" ON "miembro"("documento");
CREATE UNIQUE INDEX "miembro_codigo_miembro_key" ON "miembro"("codigo_miembro");

ALTER TABLE "miembro"
  ADD CONSTRAINT "miembro_usuario_id_fkey"
  FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;