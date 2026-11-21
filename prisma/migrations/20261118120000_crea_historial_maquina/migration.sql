-- H18 (DB-18.1): historial de los cambios de estado de las máquinas.

-- CreateTable
CREATE TABLE "historial_maquina" (
    "id" UUID NOT NULL,
    "maquina_id" UUID NOT NULL,
    "estado_anterior" "estado_maquina" NOT NULL,
    "estado_nuevo" "estado_maquina" NOT NULL,
    "motivo" VARCHAR(250) NOT NULL,
    "fecha_estimada_retorno" DATE,
    "cambiado_por" UUID NOT NULL,
    "cambiado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historial_maquina_pkey" PRIMARY KEY ("id"),
    -- Un cambio de estado cambia el estado: no se registra pasar al mismo.
    CONSTRAINT "historial_maquina_estados_check"
      CHECK ("estado_anterior" <> "estado_nuevo"),
    -- Mismo largo de motivo que la máquina (H17), y acá es obligatorio.
    CONSTRAINT "historial_maquina_motivo_check"
      CHECK (char_length(btrim("motivo")) BETWEEN 5 AND 250),
    -- Volver a OPERATIVA no lleva fecha estimada de retorno: ya retornó.
    CONSTRAINT "historial_maquina_fecha_estimada_retorno_check"
      CHECK ("estado_nuevo" <> 'OPERATIVA' OR "fecha_estimada_retorno" IS NULL)
);

-- CreateIndex: el historial se consulta por máquina y se ordena por fecha.
CREATE INDEX "historial_maquina_maquina_id_cambiado_en_idx" ON "historial_maquina"("maquina_id", "cambiado_en");

-- AddForeignKey: el historial es de la máquina, así que la sigue si se borra.
ALTER TABLE "historial_maquina" ADD CONSTRAINT "historial_maquina_maquina_id_fkey" FOREIGN KEY ("maquina_id") REFERENCES "maquina"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: el usuario que hizo el cambio no se puede borrar y dejar el
-- historial sin autor (los usuarios se desactivan, no se borran).
ALTER TABLE "historial_maquina" ADD CONSTRAINT "historial_maquina_cambiado_por_fkey" FOREIGN KEY ("cambiado_por") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
