-- H31: agrega el rol y el nombre al usuario.

-- CreateEnum
CREATE TYPE "rol" AS ENUM ('MIEMBRO', 'ENTRENADOR', 'RECEPCION', 'ADMINISTRADOR');

-- AlterTable
-- `nombre` es obligatorio, pero la tabla ya tiene usuarios (el demo del seed).
-- Se agrega con un default temporal para rellenar esas filas y después se
-- quita, para que el esquema final coincida con schema.prisma.
ALTER TABLE "users"
  ADD COLUMN "nombre" TEXT NOT NULL DEFAULT 'Sin nombre',
  ADD COLUMN "rol" "rol" NOT NULL DEFAULT 'MIEMBRO';

ALTER TABLE "users" ALTER COLUMN "nombre" DROP DEFAULT;