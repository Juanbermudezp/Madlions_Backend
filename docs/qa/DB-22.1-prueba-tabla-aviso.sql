-- DB-22.1 · Prueba de la tabla aviso (H22, Módulo 9)
--
-- Verifica a nivel de base de datos las reglas que la tabla debe garantizar.
-- Todo corre dentro de una transacción que termina en ROLLBACK: no deja datos.
-- Requiere las migraciones aplicadas y el seed (npm run db:seed).
--
-- Ejecutar desde la raíz del backend:
--   docker compose exec -T postgres psql -U postgres -d si_be_boilerplate \
--     -v ON_ERROR_STOP=1 < docs/qa/DB-22.1-prueba-tabla-aviso.sql
--
-- Resultado esperado: una línea "✔" por caso y al final "ROLLBACK".
-- Si un caso falla, psql se detiene con "✘ <caso>: <motivo>".

\set ON_ERROR_STOP 1
SET client_min_messages = notice;

BEGIN;

-- Ayudantes (viven solo en esta sesión) ------------------------------------

-- Id de la ficha de miembro a partir del correo del usuario del seed.
CREATE FUNCTION pg_temp.miembro(correo text) RETURNS uuid AS $$
DECLARE resultado uuid;
BEGIN
  SELECT m.id INTO resultado
  FROM miembro m JOIN usuario u ON u.id = m.usuario_id
  WHERE u.email = correo;
  IF resultado IS NULL THEN
    RAISE EXCEPTION '✘ Falta el miembro % del seed: corre npm run db:seed', correo;
  END IF;
  RETURN resultado;
END $$ LANGUAGE plpgsql;

-- Ejecuta una sentencia que debe fallar con un código SQLSTATE concreto.
CREATE FUNCTION pg_temp.debe_fallar(caso text, sentencia text, codigo text)
RETURNS void AS $$
DECLARE fallo boolean := false;
BEGIN
  BEGIN
    EXECUTE sentencia;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = codigo THEN
      fallo := true;
    ELSE
      RAISE EXCEPTION '✘ %: falló con % (%) y se esperaba %', caso, SQLSTATE, SQLERRM, codigo;
    END IF;
  END;
  IF NOT fallo THEN
    RAISE EXCEPTION '✘ %: la sentencia se ejecutó y debía fallar', caso;
  END IF;
  RAISE NOTICE '✔ %', caso;
END $$ LANGUAGE plpgsql;

-- Inserta un aviso con valores por defecto válidos y devuelve su id.
CREATE FUNCTION pg_temp.avisar(
  correo text,
  ref text DEFAULT NULL,
  modulo modulo_origen DEFAULT 'CLASES'
) RETURNS uuid AS $$
  INSERT INTO aviso (id, miembro_id, titulo, mensaje, modulo_origen, referencia)
  VALUES (gen_random_uuid(), pg_temp.miembro(correo),
          'Clase cancelada: Yoga', 'La clase de Yoga fue cancelada por el gimnasio.',
          modulo, ref)
  RETURNING id;
$$ LANGUAGE sql;

-- Casos ---------------------------------------------------------------------

-- C1. Un aviso nuevo queda NO_LEIDO, con fecha y hora, y sin fecha de lectura.
DO $$
DECLARE id_aviso uuid := pg_temp.avisar('miembro@madlions.com'); a aviso;
BEGIN
  SELECT * INTO a FROM aviso WHERE id = id_aviso;
  IF a.estado <> 'NO_LEIDO' OR a.creado_en IS NULL OR a.leido_en IS NOT NULL THEN
    RAISE EXCEPTION '✘ C1: valores por defecto incorrectos (%, %, %)', a.estado, a.creado_en, a.leido_en;
  END IF;
  RAISE NOTICE '✔ C1 aviso nuevo: NO_LEIDO, creado_en con fecha y hora, leido_en nulo';
END $$;

-- C2. El módulo de origen solo acepta el enum.
DO $$
BEGIN
  PERFORM pg_temp.avisar('miembro@madlions.com', NULL, 'MEMBRESIAS');
  PERFORM pg_temp.avisar('miembro@madlions.com', NULL, 'SESIONES');
  PERFORM pg_temp.avisar('miembro@madlions.com', NULL, 'PAGOS');
  RAISE NOTICE '✔ C2a acepta MEMBRESIAS, CLASES, SESIONES y PAGOS';
  PERFORM pg_temp.debe_fallar('C2b rechaza un módulo fuera del enum (RESERVAS)',
    $q$SELECT pg_temp.avisar('miembro@madlions.com', NULL, 'RESERVAS')$q$, '22P02');
END $$;

-- C3. Misma referencia para el mismo miembro: no se duplica.
DO $$
DECLARE filas int;
BEGIN
  PERFORM pg_temp.avisar('miembro@madlions.com', 'clase-42-cancelada');
  PERFORM pg_temp.avisar('demo@example.com', 'clase-42-cancelada');
  RAISE NOTICE '✔ C3a la misma referencia sí se acepta para miembros distintos';

  PERFORM pg_temp.debe_fallar('C3b un INSERT normal con referencia repetida choca con el índice único',
    $q$SELECT pg_temp.avisar('miembro@madlions.com', 'clase-42-cancelada')$q$, '23505');

  -- Lo que hará BE-22.1 con createMany({ skipDuplicates: true }).
  INSERT INTO aviso (id, miembro_id, titulo, mensaje, modulo_origen, referencia)
  VALUES (gen_random_uuid(), pg_temp.miembro('miembro@madlions.com'),
          'Clase cancelada: Yoga', 'Repetido', 'CLASES', 'clase-42-cancelada')
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS filas = ROW_COUNT;
  IF filas <> 0 THEN
    RAISE EXCEPTION '✘ C3c: ON CONFLICT DO NOTHING insertó % filas', filas;
  END IF;
  RAISE NOTICE '✔ C3c ON CONFLICT DO NOTHING omite el duplicado (0 filas)';
END $$;

-- C4. Envío a un grupo con un duplicado: se insertan los demás y se puede
-- calcular cuántos se omitieron (3 destinatarios, 1 ya avisado).
DO $$
DECLARE filas int;
BEGIN
  PERFORM pg_temp.avisar('miembro@madlions.com', 'membresia-15-vence', 'MEMBRESIAS');

  INSERT INTO aviso (id, miembro_id, titulo, mensaje, modulo_origen, referencia)
  SELECT gen_random_uuid(), pg_temp.miembro(correo), 'Tu membresía vence pronto',
         'Tu plan vence pronto.', 'MEMBRESIAS', 'membresia-15-vence'
  FROM unnest(ARRAY['miembro@madlions.com', 'demo@example.com', 'inactivo@madlions.com']) AS correo
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS filas = ROW_COUNT;
  IF filas <> 2 THEN
    RAISE EXCEPTION '✘ C4: se esperaban 2 filas nuevas y hubo %', filas;
  END IF;
  RAISE NOTICE '✔ C4 grupo de 3 con 1 duplicado: creados = 2, omitidos = 1';
END $$;

-- C5. Los avisos sin referencia nunca se consideran duplicados.
DO $$
DECLARE antes int; despues int;
BEGIN
  SELECT count(*) INTO antes FROM aviso
  WHERE miembro_id = pg_temp.miembro('demo@example.com') AND referencia IS NULL;
  PERFORM pg_temp.avisar('demo@example.com');
  PERFORM pg_temp.avisar('demo@example.com');
  SELECT count(*) INTO despues FROM aviso
  WHERE miembro_id = pg_temp.miembro('demo@example.com') AND referencia IS NULL;
  IF despues - antes <> 2 THEN
    RAISE EXCEPTION '✘ C5: se esperaban 2 avisos sin referencia y hubo %', despues - antes;
  END IF;
  RAISE NOTICE '✔ C5 dos avisos sin referencia al mismo miembro: ambos se guardan';
END $$;

-- C6. Validaciones de datos: ninguna fila inválida entra a la tabla.
DO $$
DECLARE m text := pg_temp.miembro('miembro@madlions.com')::text;
BEGIN
  PERFORM pg_temp.debe_fallar('C6a sin destinatario (miembro_id nulo)',
    $q$INSERT INTO aviso (id, miembro_id, titulo, mensaje, modulo_origen)
       VALUES (gen_random_uuid(), NULL, 'T', 'M', 'CLASES')$q$, '23502');
  PERFORM pg_temp.debe_fallar('C6b destinatario que no es miembro',
    $q$INSERT INTO aviso (id, miembro_id, titulo, mensaje, modulo_origen)
       VALUES (gen_random_uuid(), gen_random_uuid(), 'T', 'M', 'CLASES')$q$, '23503');
  PERFORM pg_temp.debe_fallar('C6c sin título (nulo)',
    format($q$INSERT INTO aviso (id, miembro_id, titulo, mensaje, modulo_origen)
       VALUES (gen_random_uuid(), %L, NULL, 'M', 'CLASES')$q$, m), '23502');
  PERFORM pg_temp.debe_fallar('C6d título vacío',
    format($q$INSERT INTO aviso (id, miembro_id, titulo, mensaje, modulo_origen)
       VALUES (gen_random_uuid(), %L, '', 'M', 'CLASES')$q$, m), '23514');
  PERFORM pg_temp.debe_fallar('C6e título de solo espacios',
    format($q$INSERT INTO aviso (id, miembro_id, titulo, mensaje, modulo_origen)
       VALUES (gen_random_uuid(), %L, '   ', 'M', 'CLASES')$q$, m), '23514');
  PERFORM pg_temp.debe_fallar('C6f título de 101 caracteres',
    format($q$INSERT INTO aviso (id, miembro_id, titulo, mensaje, modulo_origen)
       VALUES (gen_random_uuid(), %L, repeat('a', 101), 'M', 'CLASES')$q$, m), '22001');
  PERFORM pg_temp.debe_fallar('C6g mensaje vacío',
    format($q$INSERT INTO aviso (id, miembro_id, titulo, mensaje, modulo_origen)
       VALUES (gen_random_uuid(), %L, 'T', '', 'CLASES')$q$, m), '23514');
  PERFORM pg_temp.debe_fallar('C6h mensaje de 501 caracteres',
    format($q$INSERT INTO aviso (id, miembro_id, titulo, mensaje, modulo_origen)
       VALUES (gen_random_uuid(), %L, 'T', repeat('a', 501), 'CLASES')$q$, m), '22001');
  PERFORM pg_temp.debe_fallar('C6i referencia vacía',
    format($q$INSERT INTO aviso (id, miembro_id, titulo, mensaje, modulo_origen, referencia)
       VALUES (gen_random_uuid(), %L, 'T', 'M', 'CLASES', '')$q$, m), '23514');
  PERFORM pg_temp.debe_fallar('C6j referencia de 101 caracteres',
    format($q$INSERT INTO aviso (id, miembro_id, titulo, mensaje, modulo_origen, referencia)
       VALUES (gen_random_uuid(), %L, 'T', 'M', 'CLASES', repeat('a', 101))$q$, m), '22001');

  -- Los límites exactos sí entran.
  EXECUTE format($q$INSERT INTO aviso (id, miembro_id, titulo, mensaje, modulo_origen, referencia)
    VALUES (gen_random_uuid(), %L, repeat('a', 100), repeat('a', 500), 'CLASES', repeat('a', 100))$q$, m);
  RAISE NOTICE '✔ C6k título de 100, mensaje de 500 y referencia de 100 caracteres: se aceptan';
END $$;

-- C7. Estado y fecha de lectura siempre coherentes (lo usa H23).
DO $$
DECLARE id_aviso uuid := pg_temp.avisar('miembro@madlions.com');
BEGIN
  PERFORM pg_temp.debe_fallar('C7a LEIDO sin fecha de lectura',
    format($q$UPDATE aviso SET estado = 'LEIDO' WHERE id = %L$q$, id_aviso), '23514');

  UPDATE aviso SET estado = 'LEIDO', leido_en = CURRENT_TIMESTAMP WHERE id = id_aviso;
  RAISE NOTICE '✔ C7b NO_LEIDO → LEIDO con leido_en: se acepta';

  PERFORM pg_temp.debe_fallar('C7c NO_LEIDO con fecha de lectura',
    format($q$UPDATE aviso SET estado = 'NO_LEIDO' WHERE id = %L$q$, id_aviso), '23514');
END $$;

-- C8. Existen los tres índices que usan H22 y H23.
DO $$
DECLARE faltan text;
BEGIN
  SELECT string_agg(nombre, ', ') INTO faltan
  FROM unnest(ARRAY['aviso_miembro_id_creado_en_idx',
                    'aviso_miembro_id_estado_idx',
                    'aviso_miembro_id_referencia_key']) AS nombre
  WHERE NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = nombre);
  IF faltan IS NOT NULL THEN
    RAISE EXCEPTION '✘ C8: faltan los índices %', faltan;
  END IF;
  RAISE NOTICE '✔ C8 índices de bandeja, contador y deduplicación presentes';
END $$;

-- C9. Al borrar la ficha de un miembro se borran sus avisos.
DO $$
DECLARE m uuid := pg_temp.miembro('demo@example.com'); quedan int;
BEGIN
  DELETE FROM miembro WHERE id = m;
  SELECT count(*) INTO quedan FROM aviso WHERE miembro_id = m;
  IF quedan <> 0 THEN
    RAISE EXCEPTION '✘ C9: quedaron % avisos huérfanos', quedan;
  END IF;
  RAISE NOTICE '✔ C9 borrar la ficha del miembro elimina sus avisos (CASCADE)';
END $$;

ROLLBACK;
