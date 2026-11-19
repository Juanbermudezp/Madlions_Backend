-- DB-19.1 · Prueba del registro de asistencia (H19, Módulo 8)
--
-- Verifica a nivel de base de datos las reglas de las columnas nuevas de
-- `reserva` y `sesion_personal`: quién y cuándo se registró la asistencia.
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


-- Clase nueva del entrenador del seed, para que cada caso tenga la suya y no
-- choque con el índice único de (clase, miembro) de las reservas confirmadas.
CREATE FUNCTION pg_temp.clase() RETURNS uuid AS $$
  INSERT INTO clase (id, tipo_clase_id, entrenador_id, inicio, fin, cupo_maximo)
  VALUES (
    gen_random_uuid(),
    (SELECT id FROM tipo_clase LIMIT 1),
    pg_temp.usuario('entrenador@madlions.com'),
    CURRENT_TIMESTAMP - interval '2 hours',
    CURRENT_TIMESTAMP - interval '1 hour',
    10
  )
  RETURNING id;
$$ LANGUAGE sql;


-- Reserva confirmada y sin marcar de un miembro que sí tiene membresía.
CREATE FUNCTION pg_temp.reserva(id_clase uuid) RETURNS uuid AS $$
  INSERT INTO reserva (id, clase_id, miembro_id, membresia_id)
  SELECT gen_random_uuid(), id_clase, m.miembro_id, m.id
  FROM membresia m
  LIMIT 1
  RETURNING id;
$$ LANGUAGE sql;


-- Sesión personal agendada y sin marcar, con su bloque.
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
    gen_random_uuid(), id_bloque,
    (SELECT miembro_id FROM membresia LIMIT 1),
    id_entrenador, arranca, arranca + interval '60 minutes', 10.00
  )
  RETURNING id INTO id_sesion;

  RETURN id_sesion;
END $$ LANGUAGE plpgsql;

-- Casos

-- A1. Las columnas nuevas nacen nulas: lo que ya estaba guardado no cambia
-- (criterio técnico: migración sin pérdida de datos).
DO $$
DECLARE
  id_reserva uuid := pg_temp.reserva(pg_temp.clase());
  id_sesion uuid := pg_temp.sesion();
  r reserva; s sesion_personal;
BEGIN
  SELECT * INTO r FROM reserva WHERE id = id_reserva;
  SELECT * INTO s FROM sesion_personal WHERE id = id_sesion;

  IF r.asistencia <> 'SIN_REGISTRAR' OR r.asistencia_registrada_por IS NOT NULL
     OR r.asistencia_registrada_en IS NOT NULL THEN
    RAISE EXCEPTION '✘ A1: la reserva nueva no nació sin marcar (%, %, %)',
      r.asistencia, r.asistencia_registrada_por, r.asistencia_registrada_en;
  END IF;
  IF s.asistencia <> 'SIN_REGISTRAR' OR s.asistencia_registrada_por IS NOT NULL
     OR s.asistencia_registrada_en IS NOT NULL THEN
    RAISE EXCEPTION '✘ A1: la sesión nueva no nació sin marcar';
  END IF;
  RAISE NOTICE '✔ A1 reserva y sesión nacen sin marcar y sin quién ni cuándo';
END $$;

-- A2. Marcar la asistencia con quién y cuándo se acepta en las dos tablas.
DO $$
DECLARE
  id_reserva uuid := pg_temp.reserva(pg_temp.clase());
  id_sesion uuid := pg_temp.sesion();
  id_entrenador uuid := pg_temp.usuario('entrenador@madlions.com');
  r reserva;
BEGIN
  UPDATE reserva SET asistencia = 'ASISTIO', asistencia_registrada_por = id_entrenador,
    asistencia_registrada_en = CURRENT_TIMESTAMP WHERE id = id_reserva;
  UPDATE sesion_personal SET asistencia = 'NO_ASISTIO', asistencia_registrada_por = id_entrenador,
    asistencia_registrada_en = CURRENT_TIMESTAMP WHERE id = id_sesion;

  SELECT * INTO r FROM reserva WHERE id = id_reserva;
  IF r.asistencia_registrada_en IS NULL THEN
    RAISE EXCEPTION '✘ A2: no se guardó la fecha y hora del registro';
  END IF;
  RAISE NOTICE '✔ A2 la marca se guarda con quién y cuándo, en reserva y en sesión';
END $$;

-- A3. Una marca sin quién o sin cuándo se rechaza.
DO $$
DECLARE
  id_reserva uuid := pg_temp.reserva(pg_temp.clase());
  id_sesion uuid := pg_temp.sesion();
  id_entrenador uuid := pg_temp.usuario('entrenador@madlions.com');
BEGIN
  PERFORM pg_temp.debe_fallar('A3a reserva marcada sin quién la registró',
    format($q$UPDATE reserva SET asistencia = 'ASISTIO',
      asistencia_registrada_en = CURRENT_TIMESTAMP WHERE id = %L$q$, id_reserva), '23514');

  PERFORM pg_temp.debe_fallar('A3b reserva marcada sin cuándo',
    format($q$UPDATE reserva SET asistencia = 'ASISTIO',
      asistencia_registrada_por = %L WHERE id = %L$q$, id_entrenador, id_reserva), '23514');

  PERFORM pg_temp.debe_fallar('A3c sesión marcada sin quién la registró',
    format($q$UPDATE sesion_personal SET asistencia = 'ASISTIO',
      asistencia_registrada_en = CURRENT_TIMESTAMP WHERE id = %L$q$, id_sesion), '23514');

  PERFORM pg_temp.debe_fallar('A3d sesión marcada sin cuándo',
    format($q$UPDATE sesion_personal SET asistencia = 'ASISTIO',
      asistencia_registrada_por = %L WHERE id = %L$q$, id_entrenador, id_sesion), '23514');
END $$;

-- A4. Sin marcar no puede haber quién ni cuándo.
DO $$
DECLARE
  id_reserva uuid := pg_temp.reserva(pg_temp.clase());
  id_entrenador uuid := pg_temp.usuario('entrenador@madlions.com');
BEGIN
  PERFORM pg_temp.debe_fallar('A4a sin registrar pero con usuario',
    format($q$UPDATE reserva SET asistencia_registrada_por = %L WHERE id = %L$q$,
      id_entrenador, id_reserva), '23514');

  PERFORM pg_temp.debe_fallar('A4b sin registrar pero con fecha',
    format($q$UPDATE reserva SET asistencia_registrada_en = CURRENT_TIMESTAMP WHERE id = %L$q$,
      id_reserva), '23514');
END $$;

-- A5. Corregir la marca cambia también quién y cuándo (criterio 3 de H19).
DO $$
DECLARE
  id_reserva uuid := pg_temp.reserva(pg_temp.clase());
  primero timestamp;
  segundo timestamp;
BEGIN
  UPDATE reserva SET asistencia = 'ASISTIO',
    asistencia_registrada_por = pg_temp.usuario('entrenador@madlions.com'),
    asistencia_registrada_en = CURRENT_TIMESTAMP - interval '10 minutes'
  WHERE id = id_reserva
  RETURNING asistencia_registrada_en INTO primero;

  UPDATE reserva SET asistencia = 'NO_ASISTIO',
    asistencia_registrada_por = pg_temp.usuario('entrenador2@madlions.com'),
    asistencia_registrada_en = CURRENT_TIMESTAMP
  WHERE id = id_reserva
  RETURNING asistencia_registrada_en INTO segundo;

  IF segundo <= primero THEN
    RAISE EXCEPTION '✘ A5: la corrección no actualizó la fecha del registro';
  END IF;
  RAISE NOTICE '✔ A5 corregir la marca guarda la nueva, con su usuario y su fecha';
END $$;

-- A6. Volver a "sin registrar" exige limpiar quién y cuándo.
DO $$
DECLARE id_reserva uuid := pg_temp.reserva(pg_temp.clase());
BEGIN
  UPDATE reserva SET asistencia = 'ASISTIO',
    asistencia_registrada_por = pg_temp.usuario('entrenador@madlions.com'),
    asistencia_registrada_en = CURRENT_TIMESTAMP WHERE id = id_reserva;

  PERFORM pg_temp.debe_fallar('A6a volver a sin registrar dejando el usuario',
    format($q$UPDATE reserva SET asistencia = 'SIN_REGISTRAR' WHERE id = %L$q$, id_reserva),
    '23514');

  UPDATE reserva SET asistencia = 'SIN_REGISTRAR', asistencia_registrada_por = NULL,
    asistencia_registrada_en = NULL WHERE id = id_reserva;
  RAISE NOTICE '✔ A6b limpiando los tres campos sí se puede volver a sin registrar';
END $$;

-- A7. El usuario que registra tiene que existir.
DO $$
DECLARE id_reserva uuid := pg_temp.reserva(pg_temp.clase());
BEGIN
  PERFORM pg_temp.debe_fallar('A7 usuario inexistente',
    format($q$UPDATE reserva SET asistencia = 'ASISTIO',
      asistencia_registrada_por = '00000000-0000-4000-8000-000000000000',
      asistencia_registrada_en = CURRENT_TIMESTAMP WHERE id = %L$q$, id_reserva), '23503');
END $$;

-- A8. La marca no se queda sin autor: el usuario no se puede borrar.
DO $$
DECLARE
  id_reserva uuid := pg_temp.reserva(pg_temp.clase());
  id_usuario uuid;
BEGIN
  -- updated_at lo pone Prisma al guardar (@updatedAt), no la base.
  INSERT INTO usuario (id, email, password_hash, nombre, apellido, telefono, rol, updated_at)
  VALUES (gen_random_uuid(), 'borrable.h19@madlions.com', 'x', 'Prueba', 'Asistencia',
    '70000019', 'ENTRENADOR', CURRENT_TIMESTAMP)
  RETURNING id INTO id_usuario;

  UPDATE reserva SET asistencia = 'ASISTIO', asistencia_registrada_por = id_usuario,
    asistencia_registrada_en = CURRENT_TIMESTAMP WHERE id = id_reserva;

  -- 23001 (restrict_violation): lo rechaza el ON DELETE RESTRICT.
  PERFORM pg_temp.debe_fallar('A8 borrar al usuario que registró una asistencia',
    format($q$DELETE FROM usuario WHERE id = %L$q$, id_usuario), '23001');
END $$;

-- A9. Las reservas canceladas no se marcan desde la pantalla, pero la base no
-- las bloquea: la regla vive en el backend (BE-19.1). Acá solo se comprueba
-- que el CHECK de la cancelación sigue intacto después de la migración.
DO $$
DECLARE id_reserva uuid := pg_temp.reserva(pg_temp.clase());
BEGIN
  PERFORM pg_temp.debe_fallar('A9 cancelar sin fecha de cancelación',
    format($q$UPDATE reserva SET estado = 'CANCELADA_MIEMBRO' WHERE id = %L$q$, id_reserva),
    '23514');
END $$;

ROLLBACK;
