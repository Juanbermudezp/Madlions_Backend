-- QA-15.1: plantilla NO EJECUTADA. Solo lectura, para psql.
-- Usar únicamente después de confirmar destino QA aislado y autorización.
-- Proveer UUID reales de fixtures mediante variables psql, nunca credenciales.

-- BLOQUE 1: inspección sin depender de la existencia de las tablas.
BEGIN READ ONLY;
SELECT current_database() AS base_actual,
       current_setting('server_version') AS version_postgresql,
       inet_server_addr() AS servidor, inet_server_port() AS puerto;

SELECT to_regclass('public._prisma_migrations') AS migraciones,
       to_regclass('public.usuario') AS usuario,
       to_regclass('public.miembro') AS miembro,
       to_regclass('public.miembro_codigo_seq') AS secuencia_miembro,
       to_regclass('public.rutina') AS rutina,
       to_regclass('public.rutina_dia') AS rutina_dia,
       to_regclass('public.rutina_ejercicio') AS rutina_ejercicio;

SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND indexname = 'registro_progreso_medicion_unique';

SELECT conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid = to_regclass('public.registro_progreso')
  AND conname IN ('registro_progreso_valor_check', 'registro_progreso_marca_check')
ORDER BY conname;
COMMIT;

-- DETENERSE si falta alguna tabla. No usar esta plantilla para aplicar migraciones.
-- BLOQUE 2: ejecutar solo tras revisar el resultado del bloque 1.
BEGIN READ ONLY;
-- Comparar con TODOS los directorios prisma/migrations del checkout probado;
-- no basta con comprobar únicamente DB-14.1. Revisar ejecuciones incompletas.
SELECT migration_name, started_at, finished_at, rolled_back_at
FROM public._prisma_migrations ORDER BY migration_name, started_at;

-- No usar nextval para inspeccionar: consumiría un valor incluso con rollback.
SELECT last_value, is_called FROM public.miembro_codigo_seq;

SELECT conrelid::regclass AS tabla, conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid IN (to_regclass('public.rutina'), to_regclass('public.rutina_dia'), to_regclass('public.rutina_ejercicio'))
ORDER BY tabla, conname;
COMMIT;

-- BLOQUE 3: después de preparar fixtures, definir todas estas variables en psql:
-- qa_h15_entrenador, qa_h15_usuario_a, qa_h15_usuario_b,
-- qa_h15_miembro_a, qa_h15_miembro_b. Todos UUID, sin tokens/contraseñas.
BEGIN READ ONLY;
SELECT u.id AS usuario_id, u.rol, u.activo, u.nombre, u.apellido,
       m.id AS miembro_id, m.codigo_miembro
FROM public.usuario u LEFT JOIN public.miembro m ON m.usuario_id = u.id
WHERE u.id IN (:'qa_h15_entrenador'::uuid, :'qa_h15_usuario_a'::uuid, :'qa_h15_usuario_b'::uuid)
ORDER BY u.id;

-- Antes de QA-H15-04, A debe tener 2 y B 0. Después de preparar QA-H15-05,
-- A debe conservar 2 y B tener 1. Se cuentan exclusivamente las fichas QA.
SELECT m.id AS miembro_id, count(r.id) AS rutinas
FROM public.miembro m LEFT JOIN public.rutina r ON r.miembro_id = m.id
WHERE m.id IN (:'qa_h15_miembro_a'::uuid, :'qa_h15_miembro_b'::uuid)
GROUP BY m.id ORDER BY m.id;

-- Listado esperado de A; no incluye rutinas de B.
SELECT r.id, r.nombre, r.objetivo, r.fecha_inicio,
       u.id AS entrenador_id, u.nombre AS entrenador_nombre, u.apellido AS entrenador_apellido
FROM public.rutina r JOIN public.usuario u ON u.id = r.entrenador_id
WHERE r.miembro_id = :'qa_h15_miembro_a'::uuid
ORDER BY r.fecha_inicio DESC, r.creado_en DESC, r.id ASC;
COMMIT;

-- BLOQUE 4: definir qa_h15_rutina_a1 con el UUID del primer POST.
-- Ejecutar antes y después del PUT y comparar filas/IDs, no solo conteos.
BEGIN READ ONLY;
SELECT r.id AS rutina_id, r.miembro_id, r.entrenador_id, r.nombre AS rutina_nombre,
       r.objetivo, r.fecha_inicio, r.actualizado_en,
       d.id AS dia_id, d.orden AS dia_orden, d.nombre AS dia_nombre,
       e.id AS ejercicio_id, e.orden AS ejercicio_orden, e.nombre AS ejercicio_nombre,
       e.series, e.repeticiones, e.descanso_seg
FROM public.rutina r
LEFT JOIN public.rutina_dia d ON d.rutina_id = r.id
LEFT JOIN public.rutina_ejercicio e ON e.dia_id = d.id
WHERE r.id = :'qa_h15_rutina_a1'::uuid
ORDER BY d.orden, e.orden;
COMMIT;

-- Repetir las consultas del índice y CHECK H16 al terminar: deben ser idénticas.
-- No hay INSERT/UPDATE/DELETE/DDL en este archivo. Ningún bloque fue ejecutado.
