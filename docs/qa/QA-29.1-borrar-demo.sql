-- QA-29.1 · Borra los datos de demostración de QA-29.1-datos-demo.sql (todo lo marcado [QA-29.1]).
--
-- Ejecutar (PowerShell, desde la carpeta del backend):
--   Get-Content docs\qa\QA-29.1-borrar-demo.sql | docker compose exec -T postgres psql -U postgres -d si_be_boilerplate

DO $$
DECLARE
  sesiones uuid[] := ARRAY(SELECT sesion_id FROM resena WHERE comentario = '[QA-29.1]');
  bloques  uuid[] := ARRAY(SELECT bloque_id FROM sesion_personal WHERE id = ANY (sesiones));
BEGIN
  DELETE FROM resena WHERE comentario = '[QA-29.1]';
  DELETE FROM sesion_personal WHERE id = ANY (sesiones);
  DELETE FROM bloque_disponibilidad WHERE id = ANY (bloques);
  DELETE FROM reserva WHERE clase_id IN (SELECT c.id FROM clase c JOIN tipo_clase t ON t.id = c.tipo_clase_id WHERE t.nombre = '[QA-29.1] Demo');
  DELETE FROM clase WHERE tipo_clase_id IN (SELECT id FROM tipo_clase WHERE nombre = '[QA-29.1] Demo');
  DELETE FROM tipo_clase WHERE nombre = '[QA-29.1] Demo';
END $$;
