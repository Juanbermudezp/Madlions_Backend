-- DB-17.1 · Prueba de la tabla maquina (H17, Módulo 7)
--
-- Verifica a nivel de base de datos las reglas que la tabla debe garantizar.
-- Todo corre dentro de una transacción que termina en ROLLBACK: no deja datos.
-- Requiere las migraciones aplicadas y el seed (npm run db:seed).
--
-- Ejecutar desde la raíz del backend:
--   docker compose exec -T postgres psql -U postgres -d si_be_boilerplate \
--     -v ON_ERROR_STOP=1 < docs/qa/DB-17.1-prueba-tabla-maquina.sql
--
-- Resultado esperado: una línea "✔" por caso y al final "ROLLBACK".
-- Si un caso falla, psql se detiene con "✘ <caso>: <motivo>".

\set ON_ERROR_STOP 1
SET client_min_messages = notice;

BEGIN;

-- Ayudantes (viven solo en esta sesión) ------------------------------------

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

-- Inserta una máquina con valores válidos y devuelve su id. Los códigos de
-- prueba arrancan en MAQ-9xx para no chocar con el inventario del seed.
CREATE FUNCTION pg_temp.maquina(
  codigo text DEFAULT 'MAQ-901',
  nombre text DEFAULT 'Caminadora de prueba',
  tipo tipo_maquina DEFAULT 'CARDIO',
  zona zona_maquina DEFAULT 'PISO_1'
) RETURNS uuid AS $$
  INSERT INTO maquina (id, codigo, nombre, tipo, zona)
  VALUES (gen_random_uuid(), codigo, nombre, tipo, zona)
  RETURNING id;
$$ LANGUAGE sql;

-- Casos ---------------------------------------------------------------------

-- C1. Una máquina nueva nace OPERATIVA, sin retorno pendiente y sin datos del
-- último cambio (nunca cambió de estado).
DO $$
DECLARE id_maquina uuid := pg_temp.maquina(); m maquina;
BEGIN
  SELECT * INTO m FROM maquina WHERE id = id_maquina;
  IF m.estado <> 'OPERATIVA' OR m.actualizado_en IS NULL
     OR m.fecha_estimada_retorno IS NOT NULL
     OR m.ultimo_motivo IS NOT NULL OR m.ultimo_cambio_por IS NOT NULL THEN
    RAISE EXCEPTION '✘ C1: valores por defecto incorrectos (%, %, %, %, %)',
      m.estado, m.actualizado_en, m.fecha_estimada_retorno, m.ultimo_motivo, m.ultimo_cambio_por;
  END IF;
  RAISE NOTICE '✔ C1 máquina nueva: OPERATIVA, sin fecha de retorno ni datos del último cambio';
END $$;

-- C2. El código es único y sigue el formato MAQ-000.
DO $$
BEGIN
  PERFORM pg_temp.maquina('MAQ-902');
  RAISE NOTICE '✔ C2a acepta un código con el formato MAQ-000';

  PERFORM pg_temp.debe_fallar('C2b código repetido',
    $q$SELECT pg_temp.maquina('MAQ-902')$q$, '23505');
  PERFORM pg_temp.debe_fallar('C2c código del seed repetido (MAQ-001)',
    $q$SELECT pg_temp.maquina('MAQ-001')$q$, '23505');
  PERFORM pg_temp.debe_fallar('C2d código sin los 3 dígitos (MAQ-9)',
    $q$SELECT pg_temp.maquina('MAQ-9')$q$, '23514');
  PERFORM pg_temp.debe_fallar('C2e código con otro prefijo (EQ-901)',
    $q$SELECT pg_temp.maquina('EQ-901')$q$, '23514');
  PERFORM pg_temp.debe_fallar('C2f código en minúsculas (maq-901)',
    $q$SELECT pg_temp.maquina('maq-901')$q$, '23514');
  PERFORM pg_temp.debe_fallar('C2g código de más de 10 caracteres',
    $q$SELECT pg_temp.maquina('MAQ-9011234')$q$, '22001');
END $$;

-- C3. El nombre va de 2 a 60 caracteres y no puede ser solo espacios.
DO $$
BEGIN
  PERFORM pg_temp.maquina('MAQ-903', repeat('a', 60));
  PERFORM pg_temp.maquina('MAQ-904', 'ab');
  RAISE NOTICE '✔ C3a acepta nombres de 2 y de 60 caracteres';

  PERFORM pg_temp.debe_fallar('C3b nombre de 1 caracter',
    $q$SELECT pg_temp.maquina('MAQ-905', 'a')$q$, '23514');
  PERFORM pg_temp.debe_fallar('C3c nombre vacío',
    $q$SELECT pg_temp.maquina('MAQ-906', '')$q$, '23514');
  PERFORM pg_temp.debe_fallar('C3d nombre de solo espacios',
    $q$SELECT pg_temp.maquina('MAQ-907', '     ')$q$, '23514');
  PERFORM pg_temp.debe_fallar('C3e nombre de 61 caracteres',
    $q$SELECT pg_temp.maquina('MAQ-908', repeat('a', 61))$q$, '22001');
  PERFORM pg_temp.debe_fallar('C3f nombre nulo',
    $q$INSERT INTO maquina (id, codigo, nombre, tipo, zona)
       VALUES (gen_random_uuid(), 'MAQ-909', NULL, 'CARDIO', 'PISO_1')$q$, '23502');
END $$;

-- C4. Tipo, zona y estado solo aceptan los valores de su enum.
DO $$
BEGIN
  PERFORM pg_temp.maquina('MAQ-911', 'Prensa', 'FUERZA', 'PISO_2');
  PERFORM pg_temp.maquina('MAQ-912', 'Banco', 'PESO_LIBRE', 'PISO_2');
  PERFORM pg_temp.maquina('MAQ-913', 'TRX', 'FUNCIONAL', 'AREA_FUNCIONAL');
  RAISE NOTICE '✔ C4a acepta los 4 tipos y las 3 zonas';

  PERFORM pg_temp.debe_fallar('C4b tipo fuera del enum (PESAS)',
    $q$SELECT pg_temp.maquina('MAQ-914', 'X', 'PESAS', 'PISO_1')$q$, '22P02');
  PERFORM pg_temp.debe_fallar('C4c zona fuera del enum (PISO_3)',
    $q$SELECT pg_temp.maquina('MAQ-915', 'X', 'CARDIO', 'PISO_3')$q$, '22P02');
  PERFORM pg_temp.debe_fallar('C4d estado fuera del enum (ROTA)',
    $q$INSERT INTO maquina (id, codigo, nombre, tipo, zona, estado)
       VALUES (gen_random_uuid(), 'MAQ-916', 'X', 'CARDIO', 'PISO_1', 'ROTA')$q$, '22P02');
END $$;

-- C5. El motivo del último cambio va de 5 a 250 caracteres (lo exige H18).
DO $$
DECLARE id_maquina uuid := pg_temp.maquina('MAQ-921');
BEGIN
  UPDATE maquina SET estado = 'EN_MANTENIMIENTO', ultimo_motivo = repeat('a', 5)
  WHERE id = id_maquina;
  UPDATE maquina SET ultimo_motivo = repeat('a', 250) WHERE id = id_maquina;
  RAISE NOTICE '✔ C5a acepta motivos de 5 y de 250 caracteres';

  PERFORM pg_temp.debe_fallar('C5b motivo de 4 caracteres',
    format($q$UPDATE maquina SET ultimo_motivo = 'abcd' WHERE id = %L$q$, id_maquina), '23514');
  PERFORM pg_temp.debe_fallar('C5c motivo de solo espacios',
    format($q$UPDATE maquina SET ultimo_motivo = '          ' WHERE id = %L$q$, id_maquina), '23514');
  PERFORM pg_temp.debe_fallar('C5d motivo de 251 caracteres',
    format($q$UPDATE maquina SET ultimo_motivo = repeat('a', 251) WHERE id = %L$q$, id_maquina), '22001');

  UPDATE maquina SET ultimo_motivo = NULL WHERE id = id_maquina;
  RAISE NOTICE '✔ C5e el motivo nulo se acepta (máquina que nunca cambió de estado)';
END $$;

-- C6. Una máquina operativa no puede tener fecha estimada de retorno: al
-- volver a "Operativa" se borra (H18, criterio 2).
DO $$
DECLARE id_maquina uuid := pg_temp.maquina('MAQ-922');
BEGIN
  UPDATE maquina
  SET estado = 'EN_MANTENIMIENTO', ultimo_motivo = 'Banda desgastada.',
      fecha_estimada_retorno = CURRENT_DATE + 3
  WHERE id = id_maquina;
  RAISE NOTICE '✔ C6a una máquina en mantenimiento sí lleva fecha estimada de retorno';

  UPDATE maquina SET estado = 'FUERA_DE_SERVICIO' WHERE id = id_maquina;
  RAISE NOTICE '✔ C6b una máquina fuera de servicio también';

  PERFORM pg_temp.debe_fallar('C6c pasar a OPERATIVA sin borrar la fecha estimada',
    format($q$UPDATE maquina SET estado = 'OPERATIVA' WHERE id = %L$q$, id_maquina), '23514');

  UPDATE maquina SET estado = 'OPERATIVA', fecha_estimada_retorno = NULL
  WHERE id = id_maquina;
  RAISE NOTICE '✔ C6d pasar a OPERATIVA borrando la fecha estimada: se acepta';

  PERFORM pg_temp.debe_fallar('C6e crear una máquina OPERATIVA con fecha estimada',
    $q$INSERT INTO maquina (id, codigo, nombre, tipo, zona, fecha_estimada_retorno)
       VALUES (gen_random_uuid(), 'MAQ-923', 'X', 'CARDIO', 'PISO_1', CURRENT_DATE + 3)$q$, '23514');

  -- Una máquina no operativa puede no tener fecha: la pantalla muestra
  -- "Sin fecha estimada" (H17, criterio 3).
  UPDATE maquina SET estado = 'EN_MANTENIMIENTO', ultimo_motivo = 'Pendiente de revisión.'
  WHERE id = id_maquina;
  RAISE NOTICE '✔ C6f una máquina en mantenimiento puede no tener fecha estimada';
END $$;

-- C7. El usuario del último cambio es una FK que no arrastra la máquina.
DO $$
DECLARE id_maquina uuid := pg_temp.maquina('MAQ-931');
        id_usuario uuid := pg_temp.usuario('entrenador2@madlions.com');
        quien uuid;
BEGIN
  PERFORM pg_temp.debe_fallar('C7a usuario que no existe',
    format($q$UPDATE maquina SET ultimo_cambio_por = %L WHERE id = %L$q$,
           gen_random_uuid(), id_maquina), '23503');

  UPDATE maquina
  SET estado = 'EN_MANTENIMIENTO', ultimo_motivo = 'Cable suelto.',
      ultimo_cambio_por = id_usuario
  WHERE id = id_maquina;

  DELETE FROM refresh_tokens WHERE user_id = id_usuario;
  DELETE FROM bloque_disponibilidad WHERE entrenador_id = id_usuario;
  DELETE FROM clase WHERE entrenador_id = id_usuario;
  DELETE FROM usuario WHERE id = id_usuario;

  SELECT ultimo_cambio_por INTO quien FROM maquina WHERE id = id_maquina;
  IF quien IS NOT NULL THEN
    RAISE EXCEPTION '✘ C7b: ultimo_cambio_por quedó en % y debía ser nulo', quien;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM maquina WHERE id = id_maquina) THEN
    RAISE EXCEPTION '✘ C7b: borrar el usuario borró la máquina';
  END IF;
  RAISE NOTICE '✔ C7b borrar al usuario deja la máquina con ultimo_cambio_por nulo (SET NULL)';
END $$;

-- C8. Existe el índice único del código.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'maquina_codigo_key') THEN
    RAISE EXCEPTION '✘ C8: falta el índice maquina_codigo_key';
  END IF;
  RAISE NOTICE '✔ C8 índice único del código presente';
END $$;

-- C9. El inventario inicial del seed: 12 máquinas, todas operativas, con los
-- 4 tipos y las 3 zonas representados. Las máquinas MAQ-9xx son de esta prueba.
DO $$
DECLARE total int; operativas int; tipos int; zonas int;
BEGIN
  SELECT count(*) INTO total FROM maquina WHERE codigo NOT LIKE 'MAQ-9%';
  SELECT count(*) INTO operativas
  FROM maquina WHERE codigo NOT LIKE 'MAQ-9%' AND estado = 'OPERATIVA';
  SELECT count(DISTINCT tipo), count(DISTINCT zona) INTO tipos, zonas
  FROM maquina WHERE codigo NOT LIKE 'MAQ-9%';

  IF total <> 12 THEN
    RAISE EXCEPTION '✘ C9: el seed dejó % máquinas y se esperaban 12', total;
  END IF;
  IF operativas <> 12 THEN
    RAISE EXCEPTION '✘ C9: solo % de las 12 máquinas del seed están operativas', operativas;
  END IF;
  IF tipos <> 4 OR zonas <> 3 THEN
    RAISE EXCEPTION '✘ C9: el seed cubre % tipos y % zonas; se esperaban 4 y 3', tipos, zonas;
  END IF;
  RAISE NOTICE '✔ C9 inventario del seed: 12 máquinas operativas, 4 tipos y 3 zonas';
END $$;

ROLLBACK;
