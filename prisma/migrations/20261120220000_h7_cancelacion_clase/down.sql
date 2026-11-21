-- Reversión DB-7.1, NO ejecutada. Requiere autorización explícita.
-- Elimina la auditoría de cancelación, pero conserva estados, reservas y avisos.
-- Respaldar motivo_cancelacion/cancelada_en/cancelada_por_id antes de ejecutarla.
-- No permite recuperar esos datos sin respaldo. No toca objetos H16 ni CASCADE.
BEGIN;
ALTER TABLE "clase" DROP CONSTRAINT "clase_cancelacion_check";
ALTER TABLE "clase" DROP CONSTRAINT "clase_cancelada_por_id_fkey";
ALTER TABLE "clase"
    DROP COLUMN "motivo_cancelacion",
    DROP COLUMN "cancelada_en",
    DROP COLUMN "cancelada_por_id";
COMMIT;
