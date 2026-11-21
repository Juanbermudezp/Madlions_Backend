-- DB-20.1 · Prueba de la tabla resena (H20, Módulo 8)
--
-- Verifica a nivel de base de datos las reglas que la tabla debe garantizar.
-- Todo corre dentro de una transacción que termina en ROLLBACK: no deja datos.
-- Requiere las migraciones aplicadas y el seed (npm run db:seed).

\set ON_ERROR_STOP 1
SET client_min_messages = notice;

BEGIN;

-- Ayudantes que viven solo en esta sesión ------------------------------------

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


CREATE FUNCTION pg_temp.tipo_clase() RETURNS uuid AS $$
  SELECT id FROM tipo_clase LIMIT 1;
$$ LANGUAGE sql;


-- Clase que ya terminó, del entrenador del seed.
CREATE FUNCTION pg_temp.clase() RETURNS uuid AS $$
  INSERT INTO clase (id, tipo_clase_id, entrenador_id, inicio, fin, cupo_maximo)
  VALUES (
    gen_random_uuid(), pg_temp.tipo_clase(), pg_temp.usuario('entrenador@madlions.com'),
    CURRENT_TIMESTAMP - interval '2 hours', CURRENT_TIMESTAMP - interval '1 hour', 10
  )
  RETURNING id;
$$ LANGUAGE sql;


-- Reserva de prueba. La asistencia no se toca: que solo se pueda calificar
-- lo que se asistió es una regla del backend (BE-20.1), no de esta tabla.
CREATE FUNCTION pg_temp.reserva(id_clase uuid) RETURNS uuid AS $$
  INSERT INTO reserva (id, clase_id, miembro_id, membresia_id)
  SELECT gen_random_uuid(), id_clase, m.miembro_id, m.id
  FROM membresia m
  LIMIT 1
  RETURNING id;
$$ LANGUAGE sql;


CREATE FUNCTION pg_temp.sesion() RETURNS uuid AS $$
DECLARE
  id_entrenador uuid := pg_temp.usuario('entrenador@madlions.com');
  id_bloque uuid;
  id_sesion uuid;
  arranca timestamp := CURRENT_TIMESTAMP - interval '2 hours';
BEGIN
  INSERT INTO bloque_disponibilidad (id, entrenador_id, inicio, fin, duracion_min, estado)
  VALUES (gen_random_uuid(), id_entrenador, arranca, arranca + interval '60 minutes', 60, 'OCUPADO')
  RETURNING id INTO id_bloque;

  INSERT INTO sesion_personal (id, bloque_id, miembro_id, entrenador_id, inicio, fin, precio)
  VALUES (
    gen_random_uuid(), id_bloque, (SELECT miembro_id FROM membresia LIMIT 1),
    id_entrenador, arranca, arranca + interval '60 minutes', 10.00
  )
  RETURNING id INTO id_sesion;

  RETURN id_sesion;
END $$ LANGUAGE plpgsql;


CREATE FUNCTION pg_temp.miembro() RETURNS uuid AS $$
  SELECT miembro_id FROM membresia LIMIT 1;
$$ LANGUAGE sql;

-- Casos

-- R1. Una reseña de clase con las tres calificaciones y comentario.
DO $$
DECLARE
  id_reserva uuid := pg_temp.reserva(pg_temp.clase());
  r resena;
BEGIN
  INSERT INTO resena (id, miembro_id, reserva_id, entrenador_id, tipo_clase_id,
    cal_actividad, cal_entrenador, cal_instalaciones, comentario)
  VALUES (gen_random_uuid(), pg_temp.miembro(), id_reserva,
    pg_temp.usuario('entrenador@madlions.com'), pg_temp.tipo_clase(),
    5, 4, 3, 'La clase estuvo muy buena.');

  SELECT * INTO r FROM resena WHERE reserva_id = id_reserva;
  IF r.creada_en IS NULL OR r.sesion_id IS NOT NULL THEN
    RAISE EXCEPTION '✘ R1: la reseña de clase no quedó bien guardada';
  END IF;
  RAISE NOTICE '✔ R1 reseña de clase con las tres calificaciones y comentario';
END $$;

-- R2. Una reseña de sesión personal va sin tipo de clase.
DO $$
DECLARE id_sesion uuid := pg_temp.sesion();
BEGIN
  INSERT INTO resena (id, miembro_id, sesion_id, entrenador_id, cal_entrenador)
  VALUES (gen_random_uuid(), pg_temp.miembro(), id_sesion,
    pg_temp.usuario('entrenador@madlions.com'), 5);
  RAISE NOTICE '✔ R2 reseña de sesión personal, sin tipo de clase';
END $$;

-- R3. La reseña es de una clase o de una sesión, nunca de las dos ni de ninguna.
DO $$
DECLARE
  id_reserva uuid := pg_temp.reserva(pg_temp.clase());
  id_sesion uuid := pg_temp.sesion();
  id_miembro uuid := pg_temp.miembro();
  id_entrenador uuid := pg_temp.usuario('entrenador@madlions.com');
BEGIN
  PERFORM pg_temp.debe_fallar('R3a con reserva y sesión a la vez',
    format($q$INSERT INTO resena (id, miembro_id, reserva_id, sesion_id, entrenador_id, tipo_clase_id, cal_actividad)
      VALUES (gen_random_uuid(), %L, %L, %L, %L, %L, 5)$q$,
      id_miembro, id_reserva, id_sesion, id_entrenador, pg_temp.tipo_clase()), '23514');

  PERFORM pg_temp.debe_fallar('R3b sin reserva ni sesión',
    format($q$INSERT INTO resena (id, miembro_id, entrenador_id, cal_actividad)
      VALUES (gen_random_uuid(), %L, %L, 5)$q$, id_miembro, id_entrenador), '23514');
END $$;

-- R4. El tipo de clase acompaña a la clase y falta en la sesión.
DO $$
DECLARE
  id_reserva uuid := pg_temp.reserva(pg_temp.clase());
  id_sesion uuid := pg_temp.sesion();
  id_miembro uuid := pg_temp.miembro();
  id_entrenador uuid := pg_temp.usuario('entrenador@madlions.com');
BEGIN
  PERFORM pg_temp.debe_fallar('R4a reseña de clase sin tipo de clase',
    format($q$INSERT INTO resena (id, miembro_id, reserva_id, entrenador_id, cal_actividad)
      VALUES (gen_random_uuid(), %L, %L, %L, 5)$q$, id_miembro, id_reserva, id_entrenador),
    '23514');

  PERFORM pg_temp.debe_fallar('R4b reseña de sesión con tipo de clase',
    format($q$INSERT INTO resena (id, miembro_id, sesion_id, entrenador_id, tipo_clase_id, cal_actividad)
      VALUES (gen_random_uuid(), %L, %L, %L, %L, 5)$q$,
      id_miembro, id_sesion, id_entrenador, pg_temp.tipo_clase()), '23514');
END $$;

-- R5. Se puede omitir cualquier aspecto, pero no los tres (criterio 4).
DO $$
DECLARE
  id_miembro uuid := pg_temp.miembro();
  id_entrenador uuid := pg_temp.usuario('entrenador@madlions.com');
BEGIN
  PERFORM pg_temp.debe_fallar('R5a sin ninguna calificación',
    format($q$INSERT INTO resena (id, miembro_id, reserva_id, entrenador_id, tipo_clase_id, comentario)
      VALUES (gen_random_uuid(), %L, %L, %L, %L, 'Solo un comentario.')$q$,
      id_miembro, pg_temp.reserva(pg_temp.clase()), id_entrenador, pg_temp.tipo_clase()),
    '23514');

  INSERT INTO resena (id, miembro_id, reserva_id, entrenador_id, tipo_clase_id, cal_instalaciones)
  VALUES (gen_random_uuid(), id_miembro, pg_temp.reserva(pg_temp.clase()), id_entrenador,
    pg_temp.tipo_clase(), 4);
  RAISE NOTICE '✔ R5b con una sola calificación se acepta';
END $$;

-- R6. Las estrellas van de 1 a 5.
DO $$
DECLARE
  id_miembro uuid := pg_temp.miembro();
  id_entrenador uuid := pg_temp.usuario('entrenador@madlions.com');
BEGIN
  INSERT INTO resena (id, miembro_id, reserva_id, entrenador_id, tipo_clase_id,
    cal_actividad, cal_entrenador)
  VALUES (gen_random_uuid(), id_miembro, pg_temp.reserva(pg_temp.clase()), id_entrenador,
    pg_temp.tipo_clase(), 1, 5);
  RAISE NOTICE '✔ R6a acepta los bordes 1 y 5';

  PERFORM pg_temp.debe_fallar('R6b calificación 0',
    format($q$INSERT INTO resena (id, miembro_id, reserva_id, entrenador_id, tipo_clase_id, cal_actividad)
      VALUES (gen_random_uuid(), %L, %L, %L, %L, 0)$q$,
      id_miembro, pg_temp.reserva(pg_temp.clase()), id_entrenador, pg_temp.tipo_clase()),
    '23514');

  PERFORM pg_temp.debe_fallar('R6c calificación 6',
    format($q$INSERT INTO resena (id, miembro_id, reserva_id, entrenador_id, tipo_clase_id, cal_entrenador)
      VALUES (gen_random_uuid(), %L, %L, %L, %L, 6)$q$,
      id_miembro, pg_temp.reserva(pg_temp.clase()), id_entrenador, pg_temp.tipo_clase()),
    '23514');
END $$;

-- R7. El comentario es opcional y va hasta 500 caracteres.
DO $$
DECLARE
  id_miembro uuid := pg_temp.miembro();
  id_entrenador uuid := pg_temp.usuario('entrenador@madlions.com');
BEGIN
  INSERT INTO resena (id, miembro_id, reserva_id, entrenador_id, tipo_clase_id,
    cal_actividad, comentario)
  VALUES (gen_random_uuid(), id_miembro, pg_temp.reserva(pg_temp.clase()), id_entrenador,
    pg_temp.tipo_clase(), 5, repeat('a', 500));
  RAISE NOTICE '✔ R7a acepta el comentario de 500 caracteres y el nulo (R5b)';

  PERFORM pg_temp.debe_fallar('R7b comentario de 501 caracteres',
    format($q$INSERT INTO resena (id, miembro_id, reserva_id, entrenador_id, tipo_clase_id, cal_actividad, comentario)
      VALUES (gen_random_uuid(), %L, %L, %L, %L, 5, repeat('a', 501))$q$,
      id_miembro, pg_temp.reserva(pg_temp.clase()), id_entrenador, pg_temp.tipo_clase()),
    '22001');

  PERFORM pg_temp.debe_fallar('R7c comentario de solo espacios',
    format($q$INSERT INTO resena (id, miembro_id, reserva_id, entrenador_id, tipo_clase_id, cal_actividad, comentario)
      VALUES (gen_random_uuid(), %L, %L, %L, %L, 5, '     ')$q$,
      id_miembro, pg_temp.reserva(pg_temp.clase()), id_entrenador, pg_temp.tipo_clase()),
    '23514');
END $$;

-- R8. Una sola reseña por reserva y una sola por sesión (criterio 3).
DO $$
DECLARE
  id_reserva uuid := pg_temp.reserva(pg_temp.clase());
  id_sesion uuid := pg_temp.sesion();
  id_miembro uuid := pg_temp.miembro();
  id_entrenador uuid := pg_temp.usuario('entrenador@madlions.com');
BEGIN
  INSERT INTO resena (id, miembro_id, reserva_id, entrenador_id, tipo_clase_id, cal_actividad)
  VALUES (gen_random_uuid(), id_miembro, id_reserva, id_entrenador, pg_temp.tipo_clase(), 5);

  PERFORM pg_temp.debe_fallar('R8a segunda reseña de la misma reserva',
    format($q$INSERT INTO resena (id, miembro_id, reserva_id, entrenador_id, tipo_clase_id, cal_actividad)
      VALUES (gen_random_uuid(), %L, %L, %L, %L, 3)$q$,
      id_miembro, id_reserva, id_entrenador, pg_temp.tipo_clase()), '23505');

  INSERT INTO resena (id, miembro_id, sesion_id, entrenador_id, cal_actividad)
  VALUES (gen_random_uuid(), id_miembro, id_sesion, id_entrenador, 5);

  PERFORM pg_temp.debe_fallar('R8b segunda reseña de la misma sesión',
    format($q$INSERT INTO resena (id, miembro_id, sesion_id, entrenador_id, cal_actividad)
      VALUES (gen_random_uuid(), %L, %L, %L, 3)$q$, id_miembro, id_sesion, id_entrenador),
    '23505');
END $$;

-- R9. El miembro, el entrenador y el tipo de clase tienen que existir.
DO $$
DECLARE
  id_reserva uuid := pg_temp.reserva(pg_temp.clase());
  id_miembro uuid := pg_temp.miembro();
  id_entrenador uuid := pg_temp.usuario('entrenador@madlions.com');
  inexistente uuid := '00000000-0000-4000-8000-000000000000';
BEGIN
  PERFORM pg_temp.debe_fallar('R9a miembro inexistente',
    format($q$INSERT INTO resena (id, miembro_id, reserva_id, entrenador_id, tipo_clase_id, cal_actividad)
      VALUES (gen_random_uuid(), %L, %L, %L, %L, 5)$q$,
      inexistente, id_reserva, id_entrenador, pg_temp.tipo_clase()), '23503');

  PERFORM pg_temp.debe_fallar('R9b entrenador inexistente',
    format($q$INSERT INTO resena (id, miembro_id, reserva_id, entrenador_id, tipo_clase_id, cal_actividad)
      VALUES (gen_random_uuid(), %L, %L, %L, %L, 5)$q$,
      id_miembro, id_reserva, inexistente, pg_temp.tipo_clase()), '23503');

  PERFORM pg_temp.debe_fallar('R9c tipo de clase inexistente',
    format($q$INSERT INTO resena (id, miembro_id, reserva_id, entrenador_id, tipo_clase_id, cal_actividad)
      VALUES (gen_random_uuid(), %L, %L, %L, %L, 5)$q$,
      id_miembro, id_reserva, id_entrenador, inexistente), '23503');
END $$;

-- R10. La reseña sigue a su registro; el entrenador calificado no se borra.
DO $$
DECLARE
  id_reserva uuid := pg_temp.reserva(pg_temp.clase());
  id_usuario uuid;
  cuantas int;
BEGIN
  -- updated_at lo pone Prisma al guardar (@updatedAt), no la base.
  INSERT INTO usuario (id, email, password_hash, nombre, apellido, telefono, rol, updated_at)
  VALUES (gen_random_uuid(), 'borrable.h20@madlions.com', 'x', 'Prueba', 'Resena',
    '70000020', 'ENTRENADOR', CURRENT_TIMESTAMP)
  RETURNING id INTO id_usuario;

  INSERT INTO resena (id, miembro_id, reserva_id, entrenador_id, tipo_clase_id, cal_actividad)
  VALUES (gen_random_uuid(), pg_temp.miembro(), id_reserva, id_usuario, pg_temp.tipo_clase(), 5);

  -- 23001 (restrict_violation): lo rechaza el ON DELETE RESTRICT.
  PERFORM pg_temp.debe_fallar('R10a borrar al entrenador calificado',
    format($q$DELETE FROM usuario WHERE id = %L$q$, id_usuario), '23001');

  DELETE FROM reserva WHERE id = id_reserva;
  SELECT count(*) INTO cuantas FROM resena WHERE reserva_id = id_reserva;
  IF cuantas <> 0 THEN
    RAISE EXCEPTION '✘ R10b: quedó la reseña de una reserva borrada';
  END IF;
  RAISE NOTICE '✔ R10b borrar la reserva borra su reseña (CASCADE)';
END $$;

ROLLBACK;
