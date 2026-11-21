-- QA-28.1 PLANTILLA NO EJECUTADA: exclusivamente lectura para psql.
-- Confirmar primero destino QA exclusivo y autorización; no usar .env habitual.
BEGIN READ ONLY;
SELECT current_database() AS base, inet_server_addr() AS host, inet_server_port() AS puerto,
       current_setting('server_version') AS version, current_setting('TimeZone') AS zona_servidor;
SELECT nombre, to_regclass('public.' || nombre) AS tabla
FROM (VALUES ('_prisma_migrations'),('usuario'),('miembro'),('membresia'),('cobro'),('intento_pago'),('comprobante')) AS tablas(nombre);
SELECT table_name, column_name, data_type, udt_name, is_nullable
FROM information_schema.columns WHERE table_schema='public'
  AND table_name IN ('membresia','cobro','intento_pago','comprobante') ORDER BY table_name, ordinal_position;
SELECT conrelid::regclass AS tabla, conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint WHERE conrelid IN (to_regclass('public.membresia'),to_regclass('public.cobro'),to_regclass('public.comprobante'),to_regclass('public.intento_pago'))
ORDER BY tabla, conname;
SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public'
  AND (tablename IN ('membresia','cobro') OR indexname='registro_progreso_medicion_unique') ORDER BY indexname;
SELECT conname, pg_get_constraintdef(oid) AS definicion FROM pg_constraint
WHERE conrelid=to_regclass('public.registro_progreso')
  AND conname IN ('registro_progreso_valor_check','registro_progreso_marca_check') ORDER BY conname;
COMMIT;

-- Detenerse si faltan objetos/columnas o el índice/CHECK H16 difieren.
-- No reparar/aplicar migraciones mediante este script.
BEGIN READ ONLY;
SELECT migration_name, started_at, finished_at, rolled_back_at
FROM public._prisma_migrations ORDER BY migration_name, started_at;
-- Comparar TODOS los directorios prisma/migrations con ejecuciones terminadas.

-- Inspección de la matriz tras preparar fixtures EN OTRA TAREA AUTORIZADA.
-- DATE no se convierte UTC-6; pagado_en sí es timestamp almacenado en UTC.
SELECT m.id, mi.codigo_miembro, u.nombre, u.apellido, m.nombre_plan, m.tipo_plan,
       m.estado, m.fecha_vencimiento, c.estado AS estado_cobro_original, c.pagado_en
FROM public.membresia m JOIN public.miembro mi ON mi.id=m.miembro_id
JOIN public.usuario u ON u.id=mi.usuario_id
LEFT JOIN public.cobro c ON c.referencia_tipo='MEMBRESIA' AND c.referencia_id=m.id AND c.miembro_id=m.miembro_id
WHERE m.fecha_vencimiento BETWEEN date '2026-10-07' AND date '2026-11-06'
ORDER BY m.fecha_vencimiento DESC, m.id;

-- Diagnóstico de vínculos/fechas de pago. No calcula los esperados mediante H28.
SELECT m.id AS original, r.id AS renovacion, r.miembro_id=m.miembro_id AS mismo_miembro,
       r.membresia_anterior_id, r.tipo_operacion, r.estado AS estado_renovacion,
       r.fecha_vencimiento AS vencimiento_renovacion,
       cr.estado AS estado_cobro, cr.concepto, cr.pagado_en,
       (cr.pagado_en-interval '6 hours')::date AS dia_local_pago,
       (cr.pagado_en-interval '6 hours')::date-m.fecha_vencimiento AS dias_desde_vencimiento,
       i.resultado, i.referencia, cp.numero
FROM public.membresia m LEFT JOIN public.membresia r ON r.membresia_anterior_id=m.id
LEFT JOIN public.cobro cr ON cr.referencia_tipo='MEMBRESIA' AND cr.referencia_id=r.id AND cr.miembro_id=r.miembro_id
LEFT JOIN public.comprobante cp ON cp.cobro_id=cr.id
LEFT JOIN public.intento_pago i ON i.id=cp.intento_id
WHERE m.fecha_vencimiento BETWEEN date '2026-10-07' AND date '2026-11-06'
ORDER BY m.fecha_vencimiento DESC, m.id, r.id;
COMMIT;
-- Sin INSERT/UPDATE/DELETE/DDL, nextval, seed ni cambios de configuración.
