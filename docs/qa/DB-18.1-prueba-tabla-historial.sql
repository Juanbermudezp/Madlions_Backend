-- DB-18.1 · Prueba de la tabla historial_maquina (H18, Módulo 7)
--
-- Verifica a nivel de base de datos las reglas que la tabla debe garantizar.
-- Todo corre dentro de una transacción que termina en ROLLBACK: no deja datos.
-- Requiere las migraciones aplicadas y el seed (npm run db:seed).

\set ON_ERROR_STOP 1
SET client_min_messages = notice;

BEGIN;

-- Ayudantes que viven solo en esta sesión ------------------------------------

-- Id del usuario del seed a partir de su correo.
CREATE FUNCTION pg_temp.usuario(correo text) RETURNS uuid AS $$
DECLARE resultado uuid;
BEGIN
  SELECT id INTO resultado FROM usuario WHERE email = correo;
  IF resultado IS NULL THEN
    RAISE EXCEPTION '✘ Falta el usuario % del seed: corre npm run db:seed', correo;
  END IF;
  RETURN resultado;
END $$ LANGUAGE plpgsql;


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


-- Máquina de prueba. Los códigos MAQ-9xx no existen en el seed.
CREATE FUNCTION pg_temp.maquina(codigo text DEFAULT 'MAQ-951') RETURNS uuid AS $$
  INSERT INTO maquina (id, codigo, nombre, tipo, zona)
  VALUES (gen_random_uuid(), codigo, 'Máquina de prueba H18', 'CARDIO', 'PISO_1')
  RETURNING id;
$$ LANGUAGE sql;


-- Cambio de estado del historial.
CREATE FUNCTION pg_temp.historial(
  id_maquina uuid,
  estado_anterior estado_maquina DEFAULT 'OPERATIVA',
  estado_nuevo estado_maquina DEFAULT 'EN_MANTENIMIENTO',
  motivo text DEFAULT 'Banda desgastada, se espera el repuesto.',
  fecha_estimada date DEFAULT NULL,
  cambiado_en timestamp DEFAULT NULL
) RETURNS uuid AS $$
  INSERT INTO historial_maquina (
    id, maquina_id, estado_anterior, estado_nuevo, motivo,
    fecha_estimada_retorno, cambiado_por, cambiado_en
  )
  VALUES (
    gen_random_uuid(), id_maquina, estado_anterior, estado_nuevo, motivo,
    fecha_estimada, pg_temp.usuario('admin@madlions.com'),
    COALESCE(cambiado_en, CURRENT_TIMESTAMP)
  )
  RETURNING id;
$$ LANGUAGE sql;

-- Casos

-- H1. Un cambio válido se guarda con su fecha y hora.
DO $$
DECLARE
  id_maquina uuid := pg_temp.maquina('MAQ-951');
  h historial_maquina;
BEGIN
  PERFORM pg_temp.historial(id_maquina, 'OPERATIVA', 'EN_MANTENIMIENTO',
    'Banda desgastada, se espera el repuesto.', DATE '2026-12-01');
  SELECT * INTO h FROM historial_maquina WHERE maquina_id = id_maquina;

  IF h.cambiado_en IS NULL OR h.cambiado_por IS NULL THEN
    RAISE EXCEPTION '✘ H1: el cambio quedó sin fecha o sin usuario';
  END IF;
  IF h.fecha_estimada_retorno <> DATE '2026-12-01' THEN
    RAISE EXCEPTION '✘ H1: la fecha estimada no se guardó (%)', h.fecha_estimada_retorno;
  END IF;
  RAISE NOTICE '✔ H1 el cambio guarda estado anterior y nuevo, motivo, fecha estimada, usuario y fecha y hora';
END $$;

-- H2. La fecha y hora se pone sola si no se envía.
DO $$
DECLARE
  id_maquina uuid := pg_temp.maquina('MAQ-952');
  cuando timestamp;
BEGIN
  INSERT INTO historial_maquina (id, maquina_id, estado_anterior, estado_nuevo, motivo, cambiado_por)
  VALUES (gen_random_uuid(), id_maquina, 'OPERATIVA', 'FUERA_DE_SERVICIO',
    'Cable de acero reventado, no tiene reparación.', pg_temp.usuario('entrenador@madlions.com'))
  RETURNING cambiado_en INTO cuando;

  IF cuando IS NULL THEN
    RAISE EXCEPTION '✘ H2: cambiado_en quedó nulo sin valor por defecto';
  END IF;
  RAISE NOTICE '✔ H2 cambiado_en toma la fecha y hora actual por defecto';
END $$;

-- H3. El estado nuevo tiene que ser distinto del anterior (criterio técnico).
DO $$
DECLARE id_maquina uuid := pg_temp.maquina('MAQ-953');
BEGIN
  PERFORM pg_temp.debe_fallar('H3a el mismo estado en los dos campos',
    format($q$INSERT INTO historial_maquina
      (id, maquina_id, estado_anterior, estado_nuevo, motivo, cambiado_por)
      VALUES (gen_random_uuid(), %L, 'EN_MANTENIMIENTO', 'EN_MANTENIMIENTO',
        'Sigue en mantenimiento, falta el repuesto.', %L)$q$,
      id_maquina, pg_temp.usuario('admin@madlions.com')), '23514');

  PERFORM pg_temp.historial(id_maquina, 'EN_MANTENIMIENTO', 'OPERATIVA',
    'Repuesto instalado, la máquina quedó probada.');
  RAISE NOTICE '✔ H3b dos estados distintos sí se aceptan';
END $$;

-- H4. El motivo es obligatorio y va de 5 a 250 caracteres.
DO $$
DECLARE id_maquina uuid := pg_temp.maquina('MAQ-954');
BEGIN
  PERFORM pg_temp.historial(id_maquina, 'OPERATIVA', 'EN_MANTENIMIENTO', repeat('a', 5));
  PERFORM pg_temp.historial(id_maquina, 'OPERATIVA', 'FUERA_DE_SERVICIO', repeat('a', 250));
  RAISE NOTICE '✔ H4a acepta motivos de 5 y de 250 caracteres';

  PERFORM pg_temp.debe_fallar('H4b motivo de 4 caracteres',
    format($q$SELECT pg_temp.historial(%L, 'OPERATIVA', 'EN_MANTENIMIENTO', 'abcd')$q$,
      id_maquina), '23514');
  PERFORM pg_temp.debe_fallar('H4c motivo de solo espacios',
    format($q$SELECT pg_temp.historial(%L, 'OPERATIVA', 'EN_MANTENIMIENTO', '          ')$q$,
      id_maquina), '23514');
  PERFORM pg_temp.debe_fallar('H4d motivo de 251 caracteres',
    format($q$SELECT pg_temp.historial(%L, 'OPERATIVA', 'EN_MANTENIMIENTO', repeat('a', 251))$q$,
      id_maquina), '22001');
  PERFORM pg_temp.debe_fallar('H4e motivo nulo',
    format($q$INSERT INTO historial_maquina
      (id, maquina_id, estado_anterior, estado_nuevo, motivo, cambiado_por)
      VALUES (gen_random_uuid(), %L, 'OPERATIVA', 'EN_MANTENIMIENTO', NULL, %L)$q$,
      id_maquina, pg_temp.usuario('admin@madlions.com')), '23502');
END $$;

-- H5. Volver a OPERATIVA no lleva fecha estimada de retorno: ya retornó.
DO $$
DECLARE id_maquina uuid := pg_temp.maquina('MAQ-955');
BEGIN
  PERFORM pg_temp.debe_fallar('H5a retorno a OPERATIVA con fecha estimada',
    format($q$SELECT pg_temp.historial(%L, 'EN_MANTENIMIENTO', 'OPERATIVA',
      'Repuesto instalado, la máquina quedó probada.', DATE '2026-12-01')$q$,
      id_maquina), '23514');

  PERFORM pg_temp.historial(id_maquina, 'EN_MANTENIMIENTO', 'OPERATIVA',
    'Repuesto instalado, la máquina quedó probada.');
  RAISE NOTICE '✔ H5b el retorno a OPERATIVA sin fecha estimada sí se acepta';

  PERFORM pg_temp.historial(id_maquina, 'OPERATIVA', 'EN_MANTENIMIENTO',
    'Ruido en el motor, pendiente de revisión.', DATE '2026-12-15');
  RAISE NOTICE '✔ H5c salir de OPERATIVA sí puede llevar fecha estimada';
END $$;

-- H6. La máquina y el usuario tienen que existir.
DO $$
DECLARE id_maquina uuid := pg_temp.maquina('MAQ-956');
BEGIN
  PERFORM pg_temp.debe_fallar('H6a máquina inexistente',
    format($q$INSERT INTO historial_maquina
      (id, maquina_id, estado_anterior, estado_nuevo, motivo, cambiado_por)
      VALUES (gen_random_uuid(), '00000000-0000-4000-8000-000000000000',
        'OPERATIVA', 'EN_MANTENIMIENTO', 'Motivo de prueba del historial.', %L)$q$,
      pg_temp.usuario('admin@madlions.com')), '23503');

  PERFORM pg_temp.debe_fallar('H6b usuario inexistente',
    format($q$INSERT INTO historial_maquina
      (id, maquina_id, estado_anterior, estado_nuevo, motivo, cambiado_por)
      VALUES (gen_random_uuid(), %L, 'OPERATIVA', 'EN_MANTENIMIENTO',
        'Motivo de prueba del historial.', '00000000-0000-4000-8000-000000000000')$q$,
      id_maquina), '23503');

  PERFORM pg_temp.debe_fallar('H6c sin usuario',
    format($q$INSERT INTO historial_maquina
      (id, maquina_id, estado_anterior, estado_nuevo, motivo)
      VALUES (gen_random_uuid(), %L, 'OPERATIVA', 'EN_MANTENIMIENTO',
        'Motivo de prueba del historial.')$q$,
      id_maquina), '23502');
END $$;

-- H7. El historial sigue a su máquina: borrarla borra sus cambios (CASCADE).
DO $$
DECLARE
  id_maquina uuid := pg_temp.maquina('MAQ-957');
  cuantos int;
BEGIN
  PERFORM pg_temp.historial(id_maquina, 'OPERATIVA', 'EN_MANTENIMIENTO',
    'Ruido en el motor, pendiente de revisión.');
  PERFORM pg_temp.historial(id_maquina, 'EN_MANTENIMIENTO', 'OPERATIVA',
    'Repuesto instalado, la máquina quedó probada.');

  DELETE FROM maquina WHERE id = id_maquina;
  SELECT count(*) INTO cuantos FROM historial_maquina WHERE maquina_id = id_maquina;
  IF cuantos <> 0 THEN
    RAISE EXCEPTION '✘ H7: quedaron % filas de historial sin máquina', cuantos;
  END IF;
  RAISE NOTICE '✔ H7 borrar la máquina borra su historial (CASCADE)';
END $$;

-- H8. El historial no se queda sin autor: el usuario no se puede borrar.
DO $$
DECLARE
  id_maquina uuid := pg_temp.maquina('MAQ-958');
  id_usuario uuid;
BEGIN
  -- updated_at lo pone Prisma al guardar (@updatedAt), no la base.
  INSERT INTO usuario (id, email, password_hash, nombre, apellido, telefono, rol, updated_at)
  VALUES (gen_random_uuid(), 'borrable.h18@madlions.com', 'x', 'Prueba', 'Historial',
    '70000018', 'ENTRENADOR', CURRENT_TIMESTAMP)
  RETURNING id INTO id_usuario;

  INSERT INTO historial_maquina (id, maquina_id, estado_anterior, estado_nuevo, motivo, cambiado_por)
  VALUES (gen_random_uuid(), id_maquina, 'OPERATIVA', 'FUERA_DE_SERVICIO',
    'Tablero quemado, no tiene reparación.', id_usuario);

  -- 23001 (restrict_violation) y no 23503: lo rechaza el ON DELETE RESTRICT.
  PERFORM pg_temp.debe_fallar('H8 borrar al usuario que hizo un cambio',
    format($q$DELETE FROM usuario WHERE id = %L$q$, id_usuario), '23001');
END $$;

-- H9. El historial se lee del más reciente al más antiguo (criterio 3).
DO $$
DECLARE
  id_maquina uuid := pg_temp.maquina('MAQ-959');
  estados estado_maquina[];
BEGIN
  PERFORM pg_temp.historial(id_maquina, 'OPERATIVA', 'EN_MANTENIMIENTO',
    'Primer cambio: entra a mantenimiento.', NULL, TIMESTAMP '2026-11-10 08:00:00');
  PERFORM pg_temp.historial(id_maquina, 'EN_MANTENIMIENTO', 'FUERA_DE_SERVICIO',
    'Segundo cambio: no tiene reparación.', NULL, TIMESTAMP '2026-11-12 09:30:00');
  PERFORM pg_temp.historial(id_maquina, 'FUERA_DE_SERVICIO', 'OPERATIVA',
    'Tercer cambio: se reemplazó el equipo.', NULL, TIMESTAMP '2026-11-15 17:45:00');

  SELECT array_agg(estado_nuevo ORDER BY cambiado_en DESC) INTO estados
  FROM historial_maquina WHERE maquina_id = id_maquina;

  IF estados <> ARRAY['OPERATIVA', 'FUERA_DE_SERVICIO', 'EN_MANTENIMIENTO']::estado_maquina[] THEN
    RAISE EXCEPTION '✘ H9: el orden del historial no es del más reciente al más antiguo (%)', estados;
  END IF;
  RAISE NOTICE '✔ H9 el historial se ordena del más reciente al más antiguo';
END $$;

-- H10. Existe el índice por máquina y fecha que pide la ficha.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'historial_maquina'
      AND indexname = 'historial_maquina_maquina_id_cambiado_en_idx'
  ) THEN
    RAISE EXCEPTION '✘ H10: falta el índice (maquina_id, cambiado_en)';
  END IF;
  RAISE NOTICE '✔ H10 índice (maquina_id, cambiado_en) presente';
END $$;

ROLLBACK;
