-- H7/BE-25.1: PLANTILLA NO EJECUTADA. Exclusivamente lectura, para psql.
-- Requiere destino QA identificado y autorizado. No usar .env habitual.
BEGIN READ ONLY;
SELECT current_database() AS base, inet_server_addr() AS host, inet_server_port() AS puerto,
       current_setting('server_version') AS version;
SELECT nombre, to_regclass('public.' || nombre) AS tabla
FROM (VALUES ('clase'),('reserva'),('membresia'),('aviso'),('usuario'),('_prisma_migrations')) AS tablas(nombre);
SELECT table_name, column_name, data_type, character_maximum_length, is_nullable
FROM information_schema.columns WHERE table_schema='public'
  AND ((table_name='clase' AND column_name IN ('estado','inicio','motivo_cancelacion','cancelada_en','cancelada_por_id'))
       OR (table_name='reserva' AND column_name IN ('estado','cancelada_en','membresia_id')))
ORDER BY table_name, ordinal_position;
SELECT conrelid::regclass AS tabla, conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint WHERE conname IN ('clase_cancelacion_check','clase_cancelada_por_id_fkey',
    'registro_progreso_valor_check','registro_progreso_marca_check') ORDER BY conname;
SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public'
  AND indexname IN ('registro_progreso_medicion_unique','aviso_miembro_id_referencia_key','reserva_clase_miembro_confirmada_key');
COMMIT;

-- Bloque2: solo después de comprobar las tablas anteriores.
BEGIN READ ONLY;
SELECT migration_name, finished_at, rolled_back_at FROM public._prisma_migrations ORDER BY migration_name;
-- Antes de DB-7.1, cualquier fila aquí requiere conciliación autorizada:
-- la migración aborta, no inventa fecha/motivo/administrador históricos.
SELECT id, estado, inicio FROM public.clase WHERE estado='CANCELADA_GIMNASIO' ORDER BY inicio;
COMMIT;

-- Bloque3: tras DB-7.1 aplicada con autorización separada, definir en psql:
-- qa_h7_clase = UUID del manifiesto exclusivo de fixtures; no un ID ajeno.
BEGIN READ ONLY;
SELECT c.id, c.estado, c.motivo_cancelacion, c.cancelada_en, c.cancelada_por_id,
       u.rol AS rol_cancelador FROM public.clase c
LEFT JOIN public.usuario u ON u.id=c.cancelada_por_id WHERE c.id=:'qa_h7_clase'::uuid;
SELECT r.id, r.miembro_id, r.estado, r.cancelada_en, r.membresia_id, m.tipo_plan
FROM public.reserva r JOIN public.membresia m ON m.id=r.membresia_id
WHERE r.clase_id=:'qa_h7_clase'::uuid ORDER BY r.id;
-- Créditos: solo se cuentan CONFIRMADA. No consumir secuencias ni actualizar campos.
SELECT m.id, m.tipo_plan, m.cantidad_clases,
       count(r.id) FILTER (WHERE r.estado='CONFIRMADA') AS reservas_confirmadas
FROM public.membresia m LEFT JOIN public.reserva r ON r.membresia_id=m.id
WHERE m.id IN (SELECT membresia_id FROM public.reserva WHERE clase_id=:'qa_h7_clase'::uuid)
GROUP BY m.id ORDER BY m.id;
SELECT miembro_id, titulo, mensaje, modulo_origen, referencia
FROM public.aviso WHERE referencia='clase-' || :'qa_h7_clase' || '-cancelada'
ORDER BY miembro_id;
SELECT miembro_id, referencia, count(*) FROM public.aviso
WHERE referencia='clase-' || :'qa_h7_clase' || '-cancelada'
GROUP BY miembro_id, referencia HAVING count(*)>1;
COMMIT;
