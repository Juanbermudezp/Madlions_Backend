-- H9 (BE-9.2): la sesión apunta a su cobro "Sesión adicional" (Módulo 5).
ALTER TABLE "sesion_personal"
    ADD CONSTRAINT "sesion_personal_cobro_id_fkey"
    FOREIGN KEY ("cobro_id") REFERENCES "cobro"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;