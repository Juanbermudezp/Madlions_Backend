# QA-20.1. Pruebas de la calificación de una clase o sesión

**Historia:** H20. Calificación de una clase o sesión
**Responsable:** Gabriel Alejandro Batres Flores
**Fecha de ejecución:** 19/11/2026
**Entorno:** API local (puerto 8000), PostgreSQL 18 del docker-compose, datos de `npm run db:seed`; frontend con `npm run dev` (puerto 3000) y el navegador integrado, a 375 px y 1024 px.
**Herramientas:** pruebas e2e con Vitest + Supertest (`npm run test:e2e`), pruebas unitarias del backend y del frontend (`npm test`), script SQL contra la base real (`psql`) y recorrido en el navegador.

## Cómo ejecutar

```bash
docker compose up -d postgres
npm run prisma:deploy && npm run db:seed
npm run test:e2e
```

Los casos QA-01 a QA-28 están automatizados en [test/resenas.e2e-spec.ts](../../test/resenas.e2e-spec.ts). Crean sus propias clases (marcadas con `[QA-20.1]` en la descripción), reservas, sesiones y reseñas, y al terminar las borran: el seed queda igual que antes de correrlas.

Las pruebas de la tabla van aparte, en [docs/qa/DB-20.1-prueba-tabla-resena.sql](DB-20.1-prueba-tabla-resena.sql):

```bash
docker compose exec -T postgres psql -U postgres -d si_be_boilerplate -v ON_ERROR_STOP=1 < docs/qa/DB-20.1-prueba-tabla-resena.sql
```

Todo el script corre dentro de `BEGIN … ROLLBACK`, así que no deja nada en la base.

Para la pantalla, en `Madlions_Frontend`:

```bash
npm run dev
```

## Datos de prueba

| Dato | Valor |
|---|---|
| Miembro | estado.vigente@madlions.com / `Demo1234!` |
| Otro miembro | estado.proxima@madlions.com / `Demo1234!` |
| Entrenador | entrenador@madlions.com / `Demo1234!` (Carlos Martínez) |
| Recepción | recepcion@madlions.com / `Demo1234!` |
| Administrador | admin@madlions.com / `Demo1234!` |

Se usan los miembros `estado.*` del seed de H3 porque son los que tienen membresía, que es lo que una reserva necesita. Las actividades las crean las propias pruebas, porque el plazo depende de la hora en que se corren:

| Fixture | Fin | Para qué |
|---|---|---|
| Clase reciente | hace 1 día, con asistencia | Criterios 1 y 4 |
| Clase vieja | hace 8 días, con asistencia | Criterio 5 (fuera de plazo) |
| Clase sin asistencia | hace 1 día, sin registrar | Criterios 1 y 5 |
| Clase "No asistió" | hace 1 día | Criterios 1 y 5 (supuesto S12) |
| Clase de otro miembro | hace 1 día, con asistencia | Criterios 1 y 5 |
| Clase para calificar | hace 2 días, con asistencia | Criterios 2, 3 y 5 |
| Sesión personal | hace 2 días, con asistencia | Criterios 1, 2 y 3 |

### Datos para revisar la pantalla a mano

Dos clases y una sesión con asistencia registrada para `estado.vigente@madlions.com`:

```sql
DO $$
DECLARE
  id_entrenador uuid := (SELECT id FROM usuario WHERE email = 'entrenador@madlions.com');
  id_miembro uuid := (SELECT m.id FROM miembro m JOIN usuario u ON u.id = m.usuario_id
                      WHERE u.email = 'estado.vigente@madlions.com');
  id_membresia uuid := (SELECT id FROM membresia WHERE miembro_id = id_miembro LIMIT 1);
  id_clase uuid; termino timestamp; tipo record; n int := 0;
BEGIN
  FOR tipo IN SELECT id, nombre FROM tipo_clase ORDER BY nombre LIMIT 2 LOOP
    n := n + 1;
    termino := CURRENT_TIMESTAMP - (n || ' days')::interval;
    INSERT INTO clase (id, tipo_clase_id, entrenador_id, descripcion, inicio, fin, cupo_maximo)
    VALUES (gen_random_uuid(), tipo.id, id_entrenador, '[DEMO-H20] ' || tipo.nombre,
      termino - interval '1 hour', termino, 10)
    RETURNING id INTO id_clase;
    INSERT INTO reserva (id, clase_id, miembro_id, membresia_id, asistencia,
      asistencia_registrada_por, asistencia_registrada_en)
    VALUES (gen_random_uuid(), id_clase, id_miembro, id_membresia, 'ASISTIO',
      id_entrenador, termino + interval '10 minutes');
  END LOOP;
END $$;
```

Al terminar se borran las reseñas, las reservas y las clases `[DEMO-H20]`, porque las pruebas e2e esperan el inventario del seed.

> La asistencia va siempre con `asistencia_registrada_por` y `asistencia_registrada_en`: el CHECK que agregó H19 exige los tres campos juntos.

## Casos de prueba por criterio de aceptación

Los casos `QA-nn` son automáticos (e2e contra la API); los `QA-Fnn` son del recorrido en el navegador.

### Criterio 1. El miembro ve lo de los últimos 7 días con asistencia "Asistió" y sin calificar

| ID | Caso | Petición / acción | Esperado | Resultado |
|---|---|---|---|---|
| QA-01 | La clase reciente con asistencia aparece | `GET /resenas/pendientes` | 200 con la clase y su fecha límite = fin + 7 días | ✅ |
| QA-02 | La sesión personal también | Misma respuesta | `tipo: SESION` | ✅ |
| QA-03 | La de hace más de 7 días no aparece | Clase que terminó hace 8 días | No está en la lista | ✅ |
| QA-04 | La que no tiene asistencia registrada no aparece | Reserva `SIN_REGISTRAR` | No está en la lista | ✅ |
| QA-05 | La marcada "No asistió" tampoco | Reserva `NO_ASISTIO` | No está en la lista | ✅ Supuesto S12 |
| QA-06 | La de otro miembro no aparece en mi lista | Lista de cada miembro | Cada quien ve solo la suya | ✅ |
| QA-F1 | Tarjeta por actividad | `/miembro/calificar` | Nombre, "Con {entrenador}", fecha y hora | ✅ |
| QA-F2 | Aviso del plazo | Misma pantalla | "Califica antes del 25 de noviembre" | ✅ |
| QA-F3 | Estado vacío | Pantalla con un miembro sin pendientes | "No tienes clases ni sesiones por calificar" | ✅ Texto exacto |

### Criterio 2. Tres calificaciones por separado, cualquiera omitible, con comentario opcional

| ID | Caso | Petición / acción | Esperado | Resultado |
|---|---|---|---|---|
| QA-07 | Con las tres y comentario | `POST /resenas` | 201 con los tres valores y el comentario | ✅ |
| QA-08 | El entrenador y el tipo de clase se copian del registro | Lectura directa de la reseña | `entrenadorId` y `tipoClaseId` de la clase, no del cuerpo | ✅ Criterio técnico |
| QA-09 | Con una sola calificación y sin comentario | `POST /resenas` con `calEntrenador` | 201 con las otras dos en null | ✅ |
| QA-10 | La reseña de una sesión va sin tipo de clase | Lectura directa | `tipoClaseId: null` | ✅ |
| QA-11 | Calificación fuera de 1 a 5 | `POST` con 0, 6 y 2.5 | 400 en los 3 | ✅ |
| QA-12 | Comentario de más de 500 | `POST` con 501 caracteres | 400 | ✅ |
| QA-F4 | Tres filas de 5 estrellas | `/miembro/calificar` | "Clase o sesión", "Entrenador" e "Instalaciones" | ✅ |
| QA-F5 | Contador del comentario | Escribir en el comentario | `0/500` se actualiza | ✅ |
| QA-F6 | El botón Enviar se habilita al elegir una calificación | Pulsar una estrella | Enviar pasa de deshabilitado a habilitado | ✅ Criterio técnico |

### Criterio 3. Al guardar la reseña, la actividad sale de pendientes

| ID | Caso | Petición / acción | Esperado | Resultado |
|---|---|---|---|---|
| QA-13 | La clase calificada ya no aparece | `GET /resenas/pendientes` | No está en la lista | ✅ |
| QA-14 | La sesión calificada tampoco | Misma respuesta | No está en la lista | ✅ |
| QA-15 | La que no califiqué sigue ahí | Misma respuesta | Sigue en la lista | ✅ |
| QA-F7 | La tarjeta desaparece al enviar | Enviar desde la pantalla | Aviso "Gracias por tu reseña" y la tarjeta se va | ✅ Texto exacto |

### Criterio 4. Sin ninguna calificación se rechaza

| ID | Caso | Petición / acción | Esperado | Resultado |
|---|---|---|---|---|
| QA-16 | Cuerpo sin calificaciones | `POST /resenas` solo con tipo y registro | 400 "Califica al menos un aspecto." | ✅ Mensaje exacto |
| QA-17 | Solo comentario | `POST` con comentario y sin estrellas | 400 con el mismo mensaje | ✅ |
| QA-18 | El rechazo no deja reseña | Lectura directa | No hay reseña | ✅ |
| QA-F8 | El botón Enviar arranca deshabilitado | `/miembro/calificar` | No se puede enviar sin elegir nada | ✅ |

### Criterio 5. Sin asistencia, fuera de plazo o ya calificada se rechaza

| ID | Caso | Petición / acción | Esperado | Resultado |
|---|---|---|---|---|
| QA-19 | Sin asistencia registrada | `POST` sobre una reserva `SIN_REGISTRAR` | 409 | ✅ |
| QA-20 | Marcada "No asistió" | `POST` sobre una reserva `NO_ASISTIO` | 409 | ✅ |
| QA-21 | Pasados los 7 días | `POST` sobre la clase de hace 8 días | 409 | ✅ |
| QA-22 | Calificar dos veces | `POST` sobre una ya calificada | 409 | ✅ |
| QA-23 | La reseña original no cambió | Lectura directa | Conserva su calificación | ✅ |
| QA-24 | Registro inexistente | `POST` con un UUID que no existe | 404 | ✅ |
| QA-25 | Clase de otro miembro | `POST` sobre la reserva de otro | 403 | ✅ |

> El 404 de QA-24 no está en la lista de errores de la ficha (400/403/409), pero es lo coherente con el resto de la API para un id que no existe. Mismo criterio que en H18 y H19.

### Criterio 6. Entrenador, recepción y administrador no califican

| ID | Caso | Petición / acción | Esperado | Resultado |
|---|---|---|---|---|
| QA-26 | Los tres roles en los dos endpoints | `GET /resenas/pendientes` y `POST /resenas` | 403 en los 6 | ✅ |
| QA-27 | Sin sesión | Los dos endpoints sin token | 401 en los 2 | ✅ |
| QA-28 | El intento no dejó reseñas | Lectura directa | No hay reseña | ✅ |

## Pruebas realizadas en cada actividad de H20

### Actividad 1. DB-20.1. Tabla de reseñas

**Cómo:** el script [DB-20.1-prueba-tabla-resena.sql](DB-20.1-prueba-tabla-resena.sql) corre contra la base real dentro de una transacción que termina en `ROLLBACK`. Son **21 casos en 10 bloques**.

| Bloque | Qué cubre | Resultado |
|---|---|---|
| R1 | Reseña de clase con las tres calificaciones y comentario | ✅ |
| R2 | Reseña de sesión personal, sin tipo de clase | ✅ |
| R3 | Con reserva y sesión a la vez, o con ninguna de las dos | ✅ Rechazadas |
| R4 | El tipo de clase acompaña a la clase y falta en la sesión | ✅ |
| R5 | Sin ninguna calificación se rechaza; con una alcanza | ✅ |
| R6 | Las estrellas van de 1 a 5 (bordes, 0 y 6) | ✅ |
| R7 | Comentario nulo, de 500, de 501 y de solo espacios | ✅ |
| R8 | Una sola reseña por reserva y una sola por sesión | ✅ Índices únicos |
| R9 | El miembro, el entrenador y el tipo de clase tienen que existir | ✅ |
| R10 | El entrenador calificado no se borra; borrar la reserva borra su reseña | ✅ |

| Caso | Esperado | Resultado |
|---|---|---|
| Migración reversible | `down.sql` elimina la tabla y volver a aplicarla la recrea | ✅ Probado dentro de una transacción |

### Actividad 2. BE-20.1. Endpoints de reseñas

**Pruebas unitarias (27), en `src/resenas/`:**

| Archivo | Qué cubre |
|---|---|
| `services/reglas-resena.spec.ts` | **Los límites del plazo de 7 días, que es lo que pide la DoD:** el instante del fin, un milisegundo antes de cumplirse, los 7 días justos, un milisegundo después, los 8 días de la ficha y la mitad del plazo; y que el corte para listar y el límite para guardar son la misma regla |
| `services/resenas.service.spec.ts` | Los pendientes con su fecha límite; que el entrenador y el tipo de clase salen del registro y no del cuerpo; la sesión sin tipo de clase; y el 400, el 404, el 403 y los tres 409 |

**Pruebas e2e:** los 28 casos de arriba, contra la API real.

### Actividad 3. FE-20.1. Pantalla de pendientes y formulario

**Pruebas unitarias del frontend (18), en `tests/resenas.test.ts` del repositorio `Madlions_Frontend`:** cuándo se habilita Enviar, el rango 1 a 5, el cuerpo que se manda (solo los aspectos elegidos, comentario recortado y omitido si queda vacío), las fechas en hora de El Salvador, los días restantes del plazo y la Server Action (ruta, método, cuerpo, `revalidatePath` y el rechazo de los otros roles).

**Recorrido en el navegador:** `npm run dev` contra la API local, con dos miembros del seed, a 375 px y 1024 px.

| Caso | Resultado |
|---|---|
| La opción "Pendientes de calificar" aparece en el menú del miembro | ✅ |
| Estado de carga | ✅ "Cargando tus pendientes…" |
| Las estrellas se llenan hasta la elegida | ✅ |
| Volver a tocar la misma estrella quita la calificación | ✅ El aspecto es opcional |
| Enviar guarda y la tarjeta se va de la lista | ✅ |
| Lo guardado queda en la base con el entrenador y el tipo de clase | ✅ |
| A 375 px la página no se desplaza a lo ancho | ✅ |

**Cómo se ve a 1024 px:** el título "Pendientes de calificar" con una línea que explica el plazo. Debajo, una tarjeta por actividad: el nombre (el tipo de clase, o "Sesión personal"), "Con {entrenador}", el día y la hora en hora de El Salvador, y a la derecha una etiqueta gris "Califica antes del {fecha}" que se pone ámbar cuando queda un día o menos. Siguen las tres filas de estrellas —"Clase o sesión", "Entrenador" e "Instalaciones"—, el comentario con su contador `0/500` y el botón negro "Enviar", deshabilitado hasta que haya al menos una estrella.

**Cómo se ve a 375 px:** el menú lateral se oculta (comportamiento del Shell del Módulo 0). La etiqueta del plazo baja debajo de la fecha, las filas de estrellas mantienen la etiqueta a la izquierda y las cinco estrellas a la derecha, y el botón Enviar queda alineado a la derecha al final de la tarjeta.

## Una nota sobre el entorno

Al correr la suite completa de e2e fallan **9 casos de `test/qa-accesos.e2e-spec.ts`**, que son de H10 y vienen de develop. No son de H20: `src/accesos/` y ese archivo son idénticos a develop en esta rama. La causa es que **H11 cambió la regla de ingreso** (ahora pide un motivo de excepción cuando la membresía no está al día) y las pruebas de H10 no se actualizaron: crean miembros sin membresía y esperan 201 donde ahora llega 409.

## Resumen

| Criterio | Casos | Resultado |
|---|---|---|
| 1. Ver lo de los últimos 7 días con asistencia y sin calificar | QA-01 a QA-06, QA-F1 a QA-F3 | ✅ |
| 2. Tres calificaciones opcionales y comentario | QA-07 a QA-12, QA-F4 a QA-F6 | ✅ |
| 3. La actividad calificada sale de pendientes | QA-13 a QA-15, QA-F7 | ✅ |
| 4. Sin ninguna calificación se rechaza | QA-16 a QA-18, QA-F8 | ✅ |
| 5. Sin asistencia, fuera de plazo o ya calificada | QA-19 a QA-25 | ✅ |
| 6. Los otros roles no califican | QA-26 a QA-28 | ✅ |

- `npm run test:e2e` (backend): **332/341**; los 28 de H20 pasan y los 9 que fallan son de H10, heredados de develop.
- `npm test` (backend): **736/736** en 76 archivos (27 de H20).
- `npm test` (frontend): **220/220** en 16 archivos (18 de H20).
- `DB-20.1-prueba-tabla-resena.sql`: **21/21**, más la migración reversible.
- `npm run lint` y `npm run build` del backend y del frontend: sin errores.
- Pantalla `/miembro/calificar` revisada a **375 px** y **1024 px**.
