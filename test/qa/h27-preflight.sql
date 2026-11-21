-- QA-27.1. PLANTILLA NO EJECUTADA. Exclusivamente lectura, para psql.
-- Confirmar primero URL QA aislada y autorización. No usar DATABASE_URL habitual.
-- Revisar cada bloque antes de continuar. No aplica ni repara migraciones.
BEGIN READ ONLY;
SELECT current_database() AS base, inet_server_addr() AS servidor,
       inet_server_port() AS puerto, current_setting('server_version') AS version;
SELECT nombre, to_regclass('public.' || nombre) AS tabla
FROM (VALUES ('_prisma_migrations'), ('usuario'), ('miembro'), ('plan'),
             ('membresia'), ('cobro'), ('intento_pago'), ('comprobante')) AS tablas(nombre);
SELECT table_name, column_name, data_type, udt_name, is_nullable,
       numeric_precision, numeric_scale, datetime_precision
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('cobro','membresia','intento_pago','comprobante')
ORDER BY table_name, ordinal_position;
SELECT conrelid::regclass AS tabla, conname, contype, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid IN (to_regclass('public.cobro'),to_regclass('public.membresia'),
                  to_regclass('public.intento_pago'),to_regclass('public.comprobante'))
ORDER BY tabla, conname;
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND (tablename IN ('cobro','intento_pago','comprobante')
   OR indexname = 'registro_progreso_medicion_unique') ORDER BY tablename, indexname;
SELECT conname, pg_get_constraintdef(oid) AS definicion FROM pg_constraint
WHERE conrelid = to_regclass('public.registro_progreso')
  AND conname IN ('registro_progreso_valor_check','registro_progreso_marca_check') ORDER BY conname;
COMMIT;

-- DETENERSE si falta una tabla/columna/FK/índice/CHECK. No ejecutar migraciones.
BEGIN READ ONLY;
SELECT migration_name, started_at, finished_at, rolled_back_at
FROM public._prisma_migrations ORDER BY migration_name, started_at;
-- Comparar TODOS los nombres con los directorios prisma/migrations del checkout.
-- Cobros PAGADO deben vincular comprobante e intento APROBADO del mismo cobro.
SELECT c.id, c.estado, c.pagado_en, cp.id AS comprobante_id,
       i.cobro_id AS intento_cobro_id, i.resultado
FROM public.cobro c
LEFT JOIN public.comprobante cp ON cp.cobro_id = c.id
LEFT JOIN public.intento_pago i ON i.id = cp.intento_id
WHERE c.estado = 'PAGADO'
  AND (c.pagado_en IS NULL OR cp.id IS NULL OR i.id IS NULL
       OR i.cobro_id <> c.id OR i.resultado <> 'APROBADO');
-- No es FK física: referencia_tipo + referencia_id forman un vínculo polimórfico.
SELECT c.id, c.referencia_id FROM public.cobro c
LEFT JOIN public.membresia m ON m.id = c.referencia_id AND m.miembro_id = c.miembro_id
WHERE c.concepto IN ('MEMBRESIA','RENOVACION') AND c.estado = 'PAGADO'
  AND (c.referencia_tipo <> 'MEMBRESIA' OR m.id IS NULL);
COMMIT;

-- Tras preparar A en una QA VACÍA exclusiva, comparar contra CSV (no contra
-- funciones de H27). Los timestamp without time zone almacenan UTC.
BEGIN READ ONLY;
SELECT c.id, c.concepto, c.estado, c.monto, c.creado_en, c.pagado_en,
       (c.pagado_en - interval '6 hours')::date AS fecha_local,
       m.tipo_plan AS plan_historico, cp.numero, i.referencia, i.resultado,
       (SELECT count(*) FROM public.intento_pago ip WHERE ip.cobro_id = c.id) AS intentos
FROM public.cobro c
LEFT JOIN public.membresia m ON c.referencia_tipo='MEMBRESIA'
  AND c.referencia_id=m.id AND c.miembro_id=m.miembro_id
LEFT JOIN public.comprobante cp ON cp.cobro_id=c.id
LEFT JOIN public.intento_pago i ON i.id=cp.intento_id
WHERE c.pagado_en >= timestamp '2026-10-30 06:00:00'
  AND c.pagado_en < timestamp '2026-11-03 06:00:00'
ORDER BY c.pagado_en DESC, c.id ASC;
-- Reconciliación independiente: A -> 192.10/170.00/22.10. E -> 0.10/0.09/0.01.
SELECT sum(monto) AS total, round(sum(monto)/1.13,2) AS subtotal_agregado,
       sum(monto)-round(sum(monto)/1.13,2) AS iva_agregado,
       sum(round(monto/1.13,2)) AS suma_subtotales_individuales
FROM public.cobro WHERE estado='PAGADO'
  AND pagado_en >= timestamp '2026-11-01 06:00:00'
  AND pagado_en < timestamp '2026-11-03 06:00:00';
COMMIT;
-- Ningún SELECT consume secuencias ni llama funciones que escriban.
