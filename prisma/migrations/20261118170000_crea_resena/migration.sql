-- H20 (DB-20.1): reseñas de clases y de sesiones personales, con tres
-- calificaciones opcionales y un comentario.

-- CreateTable
CREATE TABLE "resena" (
    "id" UUID NOT NULL,
    "miembro_id" UUID NOT NULL,
    "reserva_id" UUID,
    "sesion_id" UUID,
    "entrenador_id" UUID NOT NULL,
    "tipo_clase_id" UUID,
    "cal_actividad" SMALLINT,
    "cal_entrenador" SMALLINT,
    "cal_instalaciones" SMALLINT,
    "comentario" VARCHAR(500),
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resena_pkey" PRIMARY KEY ("id"),
    -- La reseña es de una clase o de una sesión, nunca de las dos.
    CONSTRAINT "resena_registro_check" CHECK (
        ("reserva_id" IS NOT NULL AND "sesion_id" IS NULL)
        OR ("reserva_id" IS NULL AND "sesion_id" IS NOT NULL)
    ),
    -- El tipo de clase se copia de la clase; las sesiones no tienen.
    CONSTRAINT "resena_tipo_clase_check" CHECK (
        ("reserva_id" IS NOT NULL AND "tipo_clase_id" IS NOT NULL)
        OR ("sesion_id" IS NOT NULL AND "tipo_clase_id" IS NULL)
    ),
    -- Se puede omitir cualquier aspecto, pero no los tres.
    CONSTRAINT "resena_calificacion_check" CHECK (
        "cal_actividad" IS NOT NULL
        OR "cal_entrenador" IS NOT NULL
        OR "cal_instalaciones" IS NOT NULL
    ),
    -- Las estrellas van de 1 a 5.
    CONSTRAINT "resena_rango_check" CHECK (
        ("cal_actividad" IS NULL OR "cal_actividad" BETWEEN 1 AND 5)
        AND ("cal_entrenador" IS NULL OR "cal_entrenador" BETWEEN 1 AND 5)
        AND ("cal_instalaciones" IS NULL OR "cal_instalaciones" BETWEEN 1 AND 5)
    ),
    -- El comentario es opcional, pero si viene no puede ser solo espacios.
    CONSTRAINT "resena_comentario_check" CHECK (
        "comentario" IS NULL
        OR char_length(btrim("comentario")) BETWEEN 1 AND 500
    )
);

-- CreateIndex: una sola reseña por reserva y una sola por sesión.
CREATE UNIQUE INDEX "resena_reserva_id_key" ON "resena"("reserva_id");

-- CreateIndex
CREATE UNIQUE INDEX "resena_sesion_id_key" ON "resena"("sesion_id");

-- CreateIndex: H21 promedia por entrenador y por tipo de clase.
CREATE INDEX "resena_entrenador_id_idx" ON "resena"("entrenador_id");

-- CreateIndex
CREATE INDEX "resena_tipo_clase_id_idx" ON "resena"("tipo_clase_id");

-- AddForeignKey
ALTER TABLE "resena" ADD CONSTRAINT "resena_miembro_id_fkey" FOREIGN KEY ("miembro_id") REFERENCES "miembro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: la reseña se va con la reserva que la originó.
ALTER TABLE "resena" ADD CONSTRAINT "resena_reserva_id_fkey" FOREIGN KEY ("reserva_id") REFERENCES "reserva"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resena" ADD CONSTRAINT "resena_sesion_id_fkey" FOREIGN KEY ("sesion_id") REFERENCES "sesion_personal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: el entrenador calificado no se borra y deja la reseña huérfana.
ALTER TABLE "resena" ADD CONSTRAINT "resena_entrenador_id_fkey" FOREIGN KEY ("entrenador_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resena" ADD CONSTRAINT "resena_tipo_clase_id_fkey" FOREIGN KEY ("tipo_clase_id") REFERENCES "tipo_clase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
