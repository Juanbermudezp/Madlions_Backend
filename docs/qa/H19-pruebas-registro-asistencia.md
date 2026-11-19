# QA-19.1. Pruebas del registro de asistencia

**Historia:** H19. Registro de asistencia
**Responsable:** Gabriel Alejandro Batres Flores
**Fecha de ejecución:** 18/11/2026
**Entorno:** API local (puerto 8000), PostgreSQL 18 del docker-compose, datos de `npm run db:seed`; frontend con `npm run dev` (puerto 3000) y el navegador integrado, a 375 px y 1024 px.
**Herramientas:** pruebas e2e con Vitest + Supertest (`npm run test:e2e`), pruebas unitarias del backend y del frontend (`npm test`), script SQL contra la base real (`psql`) y recorrido en el navegador.

## Cómo ejecutar

```bash
docker compose up -d postgres
npm run prisma:deploy && npm run db:seed
npm run test:e2e
```

Los casos QA-01 a QA-29 están automatizados en [test/asistencia.e2e-spec.ts](../../test/asistencia.e2e-spec.ts). Crean sus propias clases (marcadas con `[QA-19.1]` en la descripción), reservas, bloques y sesiones, y al terminar las borran: el seed queda igual que antes de correrlas.

Las pruebas de las columnas nuevas van aparte, en [docs/qa/DB-19.1-prueba-registro-asistencia.sql](DB-19.1-prueba-registro-asistencia.sql):

```bash
docker compose exec -T postgres psql -U postgres -d si_be_boilerplate -v ON_ERROR_STOP=1 < docs/qa/DB-19.1-prueba-registro-asistencia.sql
```

Todo el script corre dentro de `BEGIN … ROLLBACK`, así que no deja nada en la base.

Para la pantalla, en `Madlions_Frontend`:

```bash
npm run dev
```

## Datos de prueba

| Dato | Valor |
|---|---|
| Entrenador | entrenador@madlions.com / `Demo1234!` (Carlos Martínez) |
| Otro entrenador | entrenador2@madlions.com / `Demo1234!` (Ana Hernández) |
| Administrador | admin@madlions.com / `Demo1234!` |
| Recepción | recepcion@madlions.com / `Demo1234!` |
| Miembro | miembro@madlions.com / `Demo1234!` |
| Miembros con membresía | los 7 `estado.*@madlions.com` del seed de H3, que es lo que las reservas necesitan |

Las actividades de prueba las crean las propias pruebas, porque la ventana de registro depende de la hora en que se corren:

| Fixture | Horario | Para qué |
|---|---|---|
| Clase en ventana | empezó hace 2 h, terminó hace 1 h | Criterios 1 a 4 |
| Clase futura | empieza en 2 h | Criterio 5 (antes del inicio) |
| Clase vieja | terminó hace 29 h | Criterio 5 (pasadas las 24 h) |
| Clase al límite | terminó hace 24 h menos 1 min | Criterio 5 (borde que sí entra) |
| Clase de otro entrenador | en ventana | Criterio 6 |
| Clase cancelada por el gimnasio | en ventana | Criterio 1 |
| Sesión personal | empezó hace 2 h | Criterios 1, 2 y 6 |

### Datos para revisar la pantalla a mano

```sql
DO $$
DECLARE
  id_entrenador uuid := (SELECT id FROM usuario WHERE email = 'entrenador@madlions.com');
  id_clase uuid;
  arranca timestamp := CURRENT_TIMESTAMP - interval '2 hours';
  socio record;
BEGIN
  INSERT INTO clase (id, tipo_clase_id, entrenador_id, descripcion, inicio, fin, cupo_maximo)
  VALUES (gen_random_uuid(), (SELECT id FROM tipo_clase LIMIT 1), id_entrenador,
    '[DEMO-H19] clase de prueba', arranca, arranca + interval '1 hour', 10)
  RETURNING id INTO id_clase;

  FOR socio IN SELECT DISTINCT ON (miembro_id) miembro_id, id FROM membresia ORDER BY miembro_id LIMIT 3 LOOP
    INSERT INTO reserva (id, clase_id, miembro_id, membresia_id)
    VALUES (gen_random_uuid(), id_clase, socio.miembro_id, socio.id);
  END LOOP;
END $$;
```

Al terminar se borran la clase y sus reservas (`DELETE FROM reserva WHERE clase_id = …;` y `DELETE FROM clase WHERE descripcion LIKE '[DEMO-H19]%';`), porque las pruebas e2e esperan el inventario del seed.

## Casos de prueba por criterio de aceptación

Los casos `QA-nn` son automáticos (e2e contra la API); los `QA-Fnn` son del recorrido en el navegador.

### Criterio 1. El entrenador ve sus clases y sesiones de la ventana, con sus miembros

| ID | Caso | Petición / acción | Esperado | Resultado |
|---|---|---|---|---|
| QA-01 | La clase en ventana aparece | `GET /asistencia/pendientes` | 200 con la clase, su tipo, nombre y horario | ✅ |
| QA-02 | Cada miembro con sus datos | Misma respuesta | `registroId`, `nombre`, `codigo` y `asistencia` | ✅ `SIN_REGISTRAR` al inicio |
| QA-03 | La sesión personal también aparece | Misma respuesta | `tipo: SESION` con su único miembro | ✅ |
| QA-04 | La clase que no empezó no aparece | Clase que empieza en 2 h | No está en la lista | ✅ |
| QA-05 | La clase de hace más de 24 h no aparece | Clase que terminó hace 29 h | No está en la lista | ✅ |
| QA-06 | La clase de otro entrenador no aparece | Lista de cada entrenador | Cada quien ve solo la suya | ✅ |
| QA-07 | La clase cancelada no aparece | Clase `CANCELADA_GIMNASIO` en ventana | No está en la lista | ✅ |
| QA-F1 | Tarjeta por actividad | `/entrenador/asistencia` | Nombre, etiqueta de tipo, día y horas, y la lista de miembros | ✅ |
| QA-F2 | Dos botones por miembro | Misma pantalla | "Asistió" y "No asistió" en cada fila | ✅ |
| QA-F3 | Aviso de cuánto queda de ventana | Misma pantalla | "Quedan 22 horas para registrar" | ✅ |
| QA-F4 | Estado vacío | `/entrenador/asistencia` con el otro entrenador | "No tienes clases ni sesiones para registrar asistencia" | ✅ Texto exacto |

### Criterio 2. Marcar guarda la asistencia con la fecha, la hora y el usuario

| ID | Caso | Petición / acción | Esperado | Resultado |
|---|---|---|---|---|
| QA-08 | Marcar "Asistió" | `PUT /asistencia` | 200; en la base quedan la marca, el entrenador y el instante | ✅ |
| QA-09 | Marcar "No asistió" | `PUT /asistencia` | Se guarda igual | ✅ |
| QA-10 | Marcar una sesión personal | `PUT /asistencia` con `tipo: SESION` | 200 y la sesión queda marcada, con quién y cuándo | ✅ |
| QA-11 | La marca se ve al volver | `GET /asistencia/pendientes` | El miembro ya sale con su asistencia | ✅ |
| QA-F5 | Guardar desde la pantalla | Marcar y pulsar Guardar | Aviso "Asistencia guardada" | ✅ Texto exacto |
| QA-F6 | Lo guardado queda en la base | Consulta directa tras guardar | Las 3 marcas con `entrenador@madlions.com` y la hora | ✅ |

### Criterio 3. La marca se corrige dentro de la misma ventana

| ID | Caso | Petición / acción | Esperado | Resultado |
|---|---|---|---|---|
| QA-12 | Cambiar la marca | `PUT` con el otro valor | 200 y la fecha del registro se actualiza | ✅ |
| QA-13 | Volver a dejarla como estaba | `PUT` otra vez | 200 | ✅ |
| QA-F7 | Corregir desde la pantalla | Pulsar el otro botón de un miembro ya marcado | La fila vuelve a quedar "sin guardar" y Guardar se habilita | ✅ |

### Criterio 4. "Marcar todos como Asistió"

| ID | Caso | Petición / acción | Esperado | Resultado |
|---|---|---|---|---|
| QA-14 | Varias marcas en una petición | `PUT` con 2 marcas | 200 y las 2 quedan guardadas | ✅ |
| QA-15 | El mismo registro dos veces | `PUT` con el mismo `registroId` repetido | 400 | ✅ |
| QA-16 | Si una falla no se guarda ninguna | `PUT` con una válida y una de otro entrenador | 403 y la válida queda como estaba | ✅ |
| QA-F8 | El botón solo toca a los no registrados | Un miembro en "No asistió" y dos sin marcar → "Marcar todos" | Los dos sin marcar pasan a "Asistió"; el de "No asistió" no cambia | ✅ |

> El botón es un cambio local: deja las marcas listas y es "Guardar" quien las manda, en una sola petición.

### Criterio 5. Fuera de la ventana el sistema lo rechaza

| ID | Caso | Petición / acción | Esperado | Resultado |
|---|---|---|---|---|
| QA-17 | Antes del inicio | `PUT` sobre la clase futura | 409 "La asistencia solo se registra desde el inicio hasta 24 horas después del fin." | ✅ Mensaje exacto |
| QA-18 | Pasadas las 24 h del fin | `PUT` sobre la clase vieja | 409 con el mismo mensaje | ✅ |
| QA-19 | El rechazo no deja marca | Lectura directa tras el rechazo | `SIN_REGISTRAR`, sin quién ni cuándo | ✅ |
| QA-20 | Justo dentro del límite | `PUT` sobre la clase que cumple 24 h en un minuto | 200 | ✅ |

> Los bordes exactos (un milisegundo antes del inicio, el inicio, el fin, las 24 h justas y un milisegundo después) están cubiertos por las pruebas unitarias de `dentroDeLaVentana`, que es lo que pide la DoD de BE-19.1.

### Criterio 6. Actividad de otro entrenador y reservas canceladas

| ID | Caso | Petición / acción | Esperado | Resultado |
|---|---|---|---|---|
| QA-21 | Clase de otro entrenador | `PUT` sobre su reserva | 403 | ✅ |
| QA-22 | Sesión de otro entrenador | `PUT` sobre su sesión | 403 | ✅ |
| QA-23 | Las reservas canceladas no salen | `GET /asistencia/pendientes` | La reserva cancelada no está en la lista | ✅ |
| QA-24 | Marcar una reserva cancelada | `PUT` sobre ella | 409 | ✅ |
| QA-25 | Registro inexistente | `PUT` con un UUID que no existe | 404 | ✅ |
| QA-26 | Los otros roles no entran | Los dos endpoints con admin, recepción y miembro | 403 en los 6 | ✅ |
| QA-27 | Sin sesión | Los dos endpoints sin token | 401 en los 2 | ✅ |

> El 404 de QA-25 no está en la lista de errores de la ficha (400/403/409), pero es lo coherente con el resto de la API para un id que no existe. Queda anotado por si en la revisión se prefiere otro código.

### Criterio 7. Lo que H20 necesita para "Pendientes de calificar"

| ID | Caso | Petición / acción | Esperado | Resultado |
|---|---|---|---|---|
| QA-28 | La asistencia "Asistió" queda consultable | Consulta por `asistencia = ASISTIO` | Trae el miembro, la fecha del registro, el entrenador y el fin de la clase | ✅ |
| QA-29 | Quien no asistió no entra | Misma consulta para un "No asistió" | No aparece | ✅ |
| QA-M1 | **Manual, pendiente de H20:** el miembro ve la clase en "Pendientes de calificar" | Marcar "Asistió" y abrir la pantalla de H20 | La clase aparece para calificar | ⏳ Pendiente: H20 todavía no existe |

> H20 leerá exactamente lo que QA-28 comprueba: las reservas y sesiones con `asistencia = ASISTIO`, con su fecha de registro para la ventana de 7 días. Cuando H20 exista, QA-M1 se ejecuta sin tocar nada de H19.

## Pruebas realizadas en cada actividad de H19

### Actividad 1. DB-19.1. Columnas del registro de asistencia

**Cómo:** el script [DB-19.1-prueba-registro-asistencia.sql](DB-19.1-prueba-registro-asistencia.sql) corre contra la base real dentro de una transacción que termina en `ROLLBACK`. Son **14 casos en 9 bloques**, sobre `reserva` y sobre `sesion_personal`.

| Bloque | Qué cubre | Resultado |
|---|---|---|
| A1 | Las columnas nuevas nacen nulas: lo que ya estaba guardado no cambia | ✅ |
| A2 | La marca se guarda con quién y cuándo, en las dos tablas | ✅ |
| A3 | Una marca sin quién o sin cuándo se rechaza (las dos tablas) | ✅ |
| A4 | Sin marcar no puede haber quién ni cuándo | ✅ |
| A5 | Corregir la marca actualiza también el usuario y la fecha | ✅ |
| A6 | Volver a "sin registrar" exige limpiar los tres campos | ✅ |
| A7 | El usuario que registra tiene que existir | ✅ |
| A8 | No se puede borrar al usuario que registró una asistencia | ✅ |
| A9 | El CHECK de la cancelación de H5 sigue intacto después de la migración | ✅ |

| Caso | Esperado | Resultado |
|---|---|---|
| Migración sin pérdida de datos | Las columnas se agregan nulas; ninguna fila existente se toca ni deja de cumplir el CHECK | ✅ Criterio técnico de la ficha |
| Migración reversible | `down.sql` quita las 4 columnas y volver a aplicarla las recrea | ✅ Probado dentro de una transacción |

> La FK de `asistencia_registrada_por` es `ON DELETE RESTRICT` y no `SET NULL`: dejar la marca sin autor rompería el CHECK que exige los tres campos juntos.

### Actividad 2. BE-19.1. Endpoints de asistencia

**Pruebas unitarias (40), en `src/asistencia/`:**

| Archivo | Qué cubre |
|---|---|
| `services/reglas-asistencia.spec.ts` | **Los límites de la ventana, que es lo que pide la DoD:** un milisegundo antes del inicio, el inicio exacto, durante la actividad, el fin exacto, las 24 h justas, un milisegundo después, un minuto después (el caso de la ficha) y la mitad de la ventana; y que el corte para listar y el límite para marcar son la misma regla |
| `services/asistencia.service.spec.ts` | Listar; marcar una y varias; corregir; 400 por repetidos; 404; 403 de otro entrenador; 409 por cancelada y por ventana; que si una marca del lote falla no se guarda ninguna; y que se revisa **cada** marca, no solo la primera |
| `dto/asistencia.dto.spec.ts` | El cuerpo: lista vacía o ausente, tipo inventado, `SIN_REGISTRAR` como marca, registro que no es UUID, campos faltantes, campos fuera del contrato y el tope de 100 marcas; y que la respuesta trae exactamente los campos del contrato |

**Pruebas e2e:** los 29 casos de arriba, contra la API real.

### Actividad 3. FE-19.1. Pantalla de asistencia

**Pruebas unitarias del frontend (18), en `tests/asistencia.test.ts` del repositorio `Madlions_Frontend`:** la selección inicial, qué se manda al guardar (solo lo que cambió, nunca "sin registrar"), "Marcar todos" sobre los no registrados sin pisar lo ya elegido, las horas en hora de El Salvador, el aviso de lo que queda de ventana, y la Server Action (ruta, método, cuerpo, `revalidatePath` y el rechazo de los otros roles).

**Recorrido en el navegador:** `npm run dev` contra la API local, con los dos entrenadores del seed, a 375 px y 1024 px.

| Caso | Resultado |
|---|---|
| La opción "Asistencia" del menú queda resaltada | ✅ |
| Estado de carga | ✅ "Cargando tus clases y sesiones…" |
| Los cambios sin guardar se marcan | ✅ Borde ámbar en la tarjeta, "N cambios sin guardar" y "● sin guardar" por fila |
| Guardar solo manda los cambios de esa tarjeta | ✅ La otra tarjeta queda intacta |
| Tras guardar, el aviso sale y las marcas quedan | ✅ |
| A 375 px la página no se desplaza a lo ancho | ✅ |

**Cómo se ve a 1024 px:** el título "Asistencia" con una línea que explica la ventana. Debajo, una tarjeta por actividad: el nombre (el tipo de clase, o "Sesión personal") con una etiqueta gris "Clase" cuando corresponde, el día y las horas en hora de El Salvador, y en gris pequeño cuánto queda de ventana. Cada miembro va en una fila con su nombre y su código monoespaciado a la izquierda, y los botones "Asistió" y "No asistió" a la derecha; el elegido se pinta en verde o en rojo. Al final de la tarjeta, "Marcar todos como Asistió" y el botón negro "Guardar", que solo se habilita si hay cambios. Mientras hay cambios sin guardar, el borde de la tarjeta se pone ámbar y aparece la etiqueta con cuántos son.

**Cómo se ve a 375 px:** el menú lateral se oculta (comportamiento del Shell del Módulo 0). Cada fila de miembro pasa a dos líneas: el nombre y el código arriba, los dos botones abajo. Los botones del pie de la tarjeta se acomodan uno debajo del otro.

## Un arreglo que vino de paso

`src/app.module.ts` importaba `CobrosModule` dos veces, lo que rompía `npm run build` en develop (`TS2300: Duplicate identifier`). Venía del merge de H9, no de H19. Se quitó la línea repetida en esta rama.

## Resumen

| Criterio | Casos | Resultado |
|---|---|---|
| 1. Ver las clases y sesiones de la ventana con sus miembros | QA-01 a QA-07, QA-F1 a QA-F4 | ✅ |
| 2. La marca se guarda con fecha, hora y usuario | QA-08 a QA-11, QA-F5 y QA-F6 | ✅ |
| 3. La marca se corrige dentro de la ventana | QA-12, QA-13, QA-F7 | ✅ |
| 4. "Marcar todos como Asistió" | QA-14 a QA-16, QA-F8 | ✅ |
| 5. Fuera de la ventana se rechaza | QA-17 a QA-20 | ✅ |
| 6. Otro entrenador y reservas canceladas | QA-21 a QA-27 | ✅ |
| 7. Lo que H20 necesita | QA-28 y QA-29 (QA-M1 pendiente de H20) | ✅ |

- `npm run test:e2e` (backend): **253/253** en 14 archivos (29 de H19).
- `npm test` (backend): **635/635** en 67 archivos (40 de H19).
- `npm test` (frontend): **113/113** en 10 archivos (18 de H19).
- `DB-19.1-prueba-registro-asistencia.sql`: **14/14**, más la migración reversible y sin pérdida de datos.
- `npm run lint` y `npm run build` del backend y del frontend: sin errores.
- Pantalla `/entrenador/asistencia` revisada a **375 px** y **1024 px**, con los dos entrenadores.
