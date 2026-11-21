-- QA-29.1 · Datos de demostración para revisar a mano el reporte de desempeño (H29)
--
-- Requisitos: migraciones aplicadas y `npm run db:seed` (usa los entrenadores
-- y los miembros con membresía del seed). Crea, dentro de los últimos 30 días:
--
-- | Entrenador                           | Clases | Ocupación | Sesiones | Reseñas    | Calificación          |
-- | ------------------------------------ | ------ | --------- | -------- | ---------- | --------------------- |
-- | Carlos Martínez (entrenador@…)       | 3      | 50.0 %    | 3        | 5, 4, 4    | 4.3                   |
-- | Ana Hernández (entrenador2@…)        | 1      | 100.0 %   | 2        | 5, 4       | Sin datos suficientes |
--
-- Carlos: 3 clases de cupo 10 con 5 reservas confirmadas cada una (15 de 30).
-- Ana: 1 clase de cupo 4 con 4 reservas confirmadas.
-- Todo lleva la marca [QA-29.1]; se borra con QA-29.1-borrar-demo.sql.
--
-- Ejecutar (PowerShell, desde la carpeta del backend):
--   Get-Content docs\qa\QA-29.1-datos-demo.sql | docker compose exec -T postgres psql -U postgres -d si_be_boilerplate

DO $$
DECLARE
  carlos uuid := (SELECT id FROM usuario WHERE email = 'entrenador@madlions.com');
  ana    uuid := (SELECT id FROM usuario WHERE email = 'entrenador2@madlions.com');
  tipo   uuid;
  m RECORD; c uuid; b uuid; s uuid; i int := 0;
BEGIN
  IF carlos IS NULL OR ana IS NULL THEN
    RAISE EXCEPTION 'Faltan los entrenadores del seed: corre npm run db:seed';
  END IF;
  IF (SELECT count(DISTINCT miembro_id) FROM membresia WHERE estado = 'PAGADA') < 5 THEN
    RAISE EXCEPTION 'Faltan miembros con membresía pagada: corre npm run db:seed';
  END IF;

  INSERT INTO tipo_clase (id, nombre, descripcion)
  VALUES (gen_random_uuid(), '[QA-29.1] Demo', 'Datos de demostración de H29')
  RETURNING id INTO tipo;

  -- Carlos: 3 clases que ya terminaron, cupo 10, 5 reservas confirmadas cada una.
  FOR d IN 2..4 LOOP
    INSERT INTO clase (id, tipo_clase_id, entrenador_id, inicio, fin, cupo_maximo)
    VALUES (gen_random_uuid(), tipo, carlos,
            now() - make_interval(days => d, hours => 2), now() - make_interval(days => d, hours => 1), 10)
    RETURNING id INTO c;
    FOR m IN
      SELECT DISTINCT ON (miembro_id) miembro_id, id FROM membresia
      WHERE estado = 'PAGADA' ORDER BY miembro_id LIMIT 5
    LOOP
      INSERT INTO reserva (id, clase_id, miembro_id, membresia_id) VALUES (gen_random_uuid(), c, m.miembro_id, m.id);
    END LOOP;
  END LOOP;

  -- Ana: 1 clase que ya terminó, cupo 4, 4 reservas confirmadas.
  INSERT INTO clase (id, tipo_clase_id, entrenador_id, inicio, fin, cupo_maximo)
  VALUES (gen_random_uuid(), tipo, ana, now() - interval '5 days 2 hours', now() - interval '5 days 1 hour', 4)
  RETURNING id INTO c;
  FOR m IN
    SELECT DISTINCT ON (miembro_id) miembro_id, id FROM membresia
    WHERE estado = 'PAGADA' ORDER BY miembro_id LIMIT 4
  LOOP
    INSERT INTO reserva (id, clase_id, miembro_id, membresia_id) VALUES (gen_random_uuid(), c, m.miembro_id, m.id);
  END LOOP;

  -- 5 sesiones con "Asistió" y una reseña cada una: 3 de Carlos (5, 4, 4) y 2 de Ana (5, 4).
  FOR m IN SELECT DISTINCT miembro_id FROM membresia WHERE estado = 'PAGADA' ORDER BY miembro_id LIMIT 5 LOOP
    i := i + 1;
    INSERT INTO bloque_disponibilidad (id, entrenador_id, inicio, fin, duracion_min, estado)
    VALUES (gen_random_uuid(), CASE WHEN i <= 3 THEN carlos ELSE ana END,
            date_trunc('hour', now()) - make_interval(days => 6 + i),
            date_trunc('hour', now()) - make_interval(days => 6 + i) + interval '60 minutes', 60, 'OCUPADO')
    RETURNING id INTO b;
    INSERT INTO sesion_personal (id, bloque_id, miembro_id, entrenador_id, inicio, fin, precio,
                                 asistencia, asistencia_registrada_por, asistencia_registrada_en)
    SELECT gen_random_uuid(), b, m.miembro_id, entrenador_id, inicio, fin, 15, 'ASISTIO', entrenador_id, fin
    FROM bloque_disponibilidad WHERE id = b
    RETURNING id INTO s;
    INSERT INTO resena (id, miembro_id, sesion_id, entrenador_id, cal_entrenador, comentario, creada_en)
    SELECT gen_random_uuid(), m.miembro_id, s, entrenador_id, (ARRAY[5, 4, 4, 5, 4])[i], '[QA-29.1]', now() - interval '1 day'
    FROM sesion_personal WHERE id = s;
  END LOOP;
END $$;
