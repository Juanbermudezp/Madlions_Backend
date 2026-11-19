-- QA-14.1: inspección de solo lectura, preparada pero NO ejecutada.
-- Usar únicamente contra la base de pruebas aislada previamente verificada.
SELECT current_database() AS base_actual, current_setting('server_version') AS version_postgresql;

SELECT to_regclass('public.rutina') AS rutina,
       to_regclass('public.rutina_dia') AS rutina_dia,
       to_regclass('public.rutina_ejercicio') AS rutina_ejercicio,
       to_regclass('public.registro_progreso') AS registro_progreso;

-- Ejecutar esta consulta solo si existe _prisma_migrations.
SELECT migration_name, finished_at, rolled_back_at
FROM "_prisma_migrations"
WHERE migration_name IN (
    '20261117190000_crea_rutina',
    '20261108023826_h16_registro_progreso'
)
ORDER BY migration_name;

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'registro_progreso'
  AND indexname = 'registro_progreso_medicion_unique';

SELECT conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid = to_regclass('public.registro_progreso')
  AND conname IN ('registro_progreso_valor_check', 'registro_progreso_marca_check')
ORDER BY conname;
