-- Reversión de DB-14.1: elimina las tres tablas y sus datos, índices y CHECK.
-- Orden inverso de dependencias; sin CASCADE para no borrar objetos ajenos.
-- Preparado para revisión; ejecutar solo con autorización explícita.
BEGIN;
DROP TABLE "rutina_ejercicio";
DROP TABLE "rutina_dia";
DROP TABLE "rutina";
COMMIT;
