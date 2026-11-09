# QA-1.1. Pruebas de la definición y administración de planes

**Historia:** H1. Definición y administración de planes
**Responsable:** _(completar)_
**Fecha de ejecución:** 08/11/2026
**Entorno:** API local (puerto 8000), PostgreSQL 18 del docker-compose, datos de `npm run db:seed`; frontend con `npm run dev` (puerto 3000) y Google Chrome.
**Herramientas:** pruebas e2e con Vitest + Supertest (`npm run test:e2e`), pruebas unitarias (`npm test`) y revisión en el navegador.

## Cómo ejecutar

```bash
docker compose up -d postgres
npm run prisma:deploy && npm run db:seed
npm run test:e2e
```

Los casos QA-01 a QA-32 están automatizados en [test/planes.e2e-spec.ts](../../test/planes.e2e-spec.ts). Levantan la API real (mismo prefijo `api/v1` y `ValidationPipe` que `main.ts`), inician sesión con los usuarios del seed y, al terminar, borran los planes que crearon (todos llevan el prefijo `[QA-1.1]`) y devuelven el precio de la clase puntual a su valor original.

## Datos de prueba

| Dato | Valor |
|---|---|
| Administrador | admin@madlions.com / `Demo1234!` |
| Recepción | recepcion@madlions.com / `Demo1234!` |
| Entrenador | entrenador@madlions.com / `Demo1234!` |
| Miembro | miembro@madlions.com / `Demo1234!` |
| Tipos de clase del seed | Crossfit, Spinning, Yoga |
| Precio inicial de la clase puntual | `10.00` (fila que crea la migración) |

## Casos de prueba por criterio de aceptación

### Criterio 1. Registrar planes Daypass, Mensual y Set de clases mensual, activos y en el catálogo

| ID | Caso | Petición | Esperado | Resultado |
|---|---|---|---|---|
| QA-01 | Registrar un Daypass | `POST /planes` (admin) `{ tipo: "DAYPASS", precio: 5 }` | 201 activo | ✅ 201, `activo: true` |
| QA-02 | Registrar un Mensual con tipos de clase | `POST /planes` (admin) `{ tipo: "MENSUAL", precio: 35.5, tiposClaseIds: [2 tipos] }` | 201 activo con sus tipos | ✅ 201, `cantidadClases: null`, 2 tipos de clase |
| QA-03 | Registrar un Set de clases mensual | `POST /planes` (admin) `{ tipo: "SET_CLASES", cantidadClases: 10 }` | 201 activo | ✅ 201, `cantidadClases: 10` |
| QA-04 | Aparecen en el catálogo | `GET /planes` (miembro) | Los 3 planes en la lista | ✅ Aparecen los 3 |

### Criterio 2. Duraciones de cobertura y sets de 1 a 100 clases

| ID | Caso | Petición | Esperado | Resultado |
|---|---|---|---|---|
| QA-05 | Duración según el tipo | `POST /planes` de cada tipo | Daypass 1 día; Mensual y Set 30 días | ✅ 1 / 30 / 30 |
| QA-06 | La duración no se envía | `POST /planes` con `duracionDias: 90` | 400 | ✅ 400 (`duracionDias` no es parte del contrato) |
| QA-07 | Bordes válidos | `POST /planes` Set con 1 y con 100 clases | 201 | ✅ 201 y 201 |
| QA-08 | Cantidad 0 y 101 | `POST /planes` Set con 0 y con 101 clases | 400 | ✅ 400 "La cantidad de clases debe ser un entero entre 1 y 100." |
| QA-09 | Set sin cantidad | `POST /planes` Set sin `cantidadClases` | 400 | ✅ 400 "Los planes SET_CLASES requieren cantidadClases entre 1 y 100." |
| QA-10 | Mensual con cantidad | `POST /planes` Mensual con `cantidadClases: 5` | 400 | ✅ 400 "Solo los planes SET_CLASES llevan cantidadClases." |

> Además, la base de datos lo garantiza con CHECK (`plan_duracion_dias_check`, `plan_cantidad_clases_check`), probados al crear la migración.

### Criterio 3. El precio de la clase puntual se aplica a nuevas sesiones

| ID | Caso | Petición | Esperado | Resultado |
|---|---|---|---|---|
| QA-11 | Todos los roles consultan el precio | `GET /configuracion/precio-clase-puntual` (4 roles) | 200 `{ precio: "10.00" }` | ✅ 200 en los 4 roles |
| QA-12 | Cambiar el precio | `PUT /configuracion/precio-clase-puntual` (admin) `{ precio: 12.5 }` | 200 `{ precio: "12.50" }` | ✅ 200 `"12.50"` |
| QA-13 | Las sesiones nuevas toman el precio nuevo | `ConfiguracionService.obtenerPrecioClasePuntual()` (lo que usa BE-9.2) y `GET` como miembro | `"12.50"` | ✅ `"12.50"` en ambos |
| QA-14 | Precios inválidos | `PUT` con `0`, `-5` y `12.555` | 400 con un solo mensaje | ✅ 400 "El precio debe ser mayor que 0 y tener como máximo 2 decimales." |
| QA-M1 | **Manual, pendiente de H9:** agendar una sesión personal después de cambiar el precio | Cambiar el precio a 12.50 y agendar una sesión (Módulo 3) | La sesión se cobra a 12.50; las ya agendadas conservan su precio | ⏳ Pendiente: las sesiones personales llegan con H9 |

> QA-13 verifica el punto de integración: el Módulo 3 obtiene el precio con `ConfiguracionService.obtenerPrecioClasePuntual()`, que siempre lee el valor vigente. QA-M1 se ejecuta cuando exista el agendamiento de sesiones.

### Criterio 4. Editar un plan no modifica membresías ni cobros, y su tipo no cambia

| ID | Caso | Petición | Esperado | Resultado |
|---|---|---|---|---|
| QA-15 | Editar datos del plan | `PATCH /planes/{id}` (admin) nombre, precio 42.25, beneficios y tipos de clase | 200 con los cambios | ✅ 200 |
| QA-16 | El tipo no cambia | `PATCH /planes/{id}` `{ tipo: "DAYPASS", precio: 40 }` sobre un Mensual | 200, sigue `MENSUAL` con 30 días | ✅ 200, `tipo: MENSUAL`, `duracionDias: 30` |
| QA-17 | Editar no toca otras tablas | Huella (md5 del contenido) de **todas** las tablas salvo `plan` y `plan_tipo_clase`, antes y después del `PATCH` | Huellas idénticas | ✅ Idénticas |
| QA-18 | Plan inexistente | `PATCH /planes/00000000-0000-4000-8000-000000000000` | 404 | ✅ 404 "El plan no existe." |
| QA-M2 | **Manual, pendiente de H2:** editar un plan ya vendido | Vender una membresía del plan, editar precio y beneficios del plan | La membresía conserva el precio y las condiciones copiadas al venderla | ⏳ Pendiente: las tablas de membresías y cobros llegan con H2 |

> QA-17 comprueba que el código de planes no escribe en ninguna otra tabla; cuando H2 cree `membresia` y los cobros, quedarán cubiertas por esta misma prueba sin cambios. Se verificó que la huella sí detecta cambios (modificar un teléfono de `usuario` cambia el md5).

### Criterio 5. Desactivar impide nuevas compras y renovaciones sin afectar membresías pagadas

| ID | Caso | Petición | Esperado | Resultado |
|---|---|---|---|---|
| QA-19 | Desactivar sin tocar otras tablas | `PATCH /planes/{id}/desactivar` (admin) + huella de las demás tablas | 200 `activo: false`; huellas idénticas | ✅ 200; idénticas |
| QA-20 | Sale del catálogo de venta | `GET /planes` como miembro, recepción y entrenador | El plan no aparece | ✅ No aparece en ninguno de los 3 |
| QA-21 | El administrador lo sigue viendo | `GET /planes` (admin) | Aparece con `activo: false` | ✅ |
| QA-22 | Desactivar dos veces | `PATCH /planes/{id}/desactivar` otra vez | 409 | ✅ 409 "El plan ya está inactivo." |
| QA-M3 | **Manual, pendiente de H2:** intentar comprar o renovar un plan inactivo, y revisar una membresía pagada de ese plan | Recepción intenta vender/renovar el plan; consultar la membresía existente | No se puede vender ni renovar; la membresía pagada sigue vigente | ⏳ Pendiente: compras y renovaciones llegan con H2 |

### Criterio 6. Campos obligatorios, precio, cantidades y nombre único, con sus errores

| ID | Caso | Petición | Esperado | Resultado |
|---|---|---|---|---|
| QA-23 | Falta un campo obligatorio | `POST /planes` sin `nombre`, `tipo`, `precio`, `beneficios` o `tiposClaseIds` | 400 | ✅ 400 en los 5 casos |
| QA-24 | Precio 0, negativo o con 3 decimales | `POST /planes` con `0`, `-10` y `10.555` | 400 | ✅ 400 "El precio debe ser mayor que 0 y tener como máximo 2 decimales." |
| QA-25 | Nombre repetido sin importar mayúsculas | `POST /planes` con el nombre de otro plan en mayúsculas | 409 | ✅ 409 "Ya existe un plan con ese nombre" |
| QA-26 | Nombre de 61+ caracteres y beneficios de 501 | `POST /planes` | 400 | ✅ 400 con el mensaje de cada campo |
| QA-27 | Tipo de clase inexistente | `POST /planes` con un UUID que no existe | 400 | ✅ 400 "Uno o más tipos de clase no existen." |
| QA-28 | Nombre repetido al editar | `PATCH /planes/{id}` con el nombre de otro plan | 409 | ✅ 409 |
| QA-F1 | Errores junto a cada campo (frontend) | `/admin/planes` → Nuevo plan → Guardar vacío | Mensaje bajo Nombre, Tipo, Precio y Beneficios | ✅ (Chrome) |
| QA-F2 | Precio 0 y 101 clases (frontend) | Formulario con precio `0` y cantidad `101` | Mensaje bajo Precio y bajo Cantidad de clases; no se envía | ✅ (Chrome) |
| QA-F3 | Error del backend junto al campo | Guardar un plan con un nombre existente en otras mayúsculas | "Ya existe un plan con ese nombre" bajo Nombre | ✅ (Chrome) |

### Criterio 7. Solo ADMINISTRADOR modifica planes y precios; los demás reciben "Acceso denegado"

| ID | Caso | Petición | Esperado | Resultado |
|---|---|---|---|---|
| QA-29 | Sin sesión | `GET /planes` sin token | 401 | ✅ 401 |
| QA-30 | Los 4 roles consultan planes | `GET /planes` (admin, recepción, entrenador, miembro) | 200 | ✅ 200 en los 4 |
| QA-31 | Recepción, entrenador y miembro intentan modificar | `POST /planes`, `PATCH /planes/{id}`, `PATCH /planes/{id}/desactivar`, `PUT /configuracion/precio-clase-puntual` | 403 y el plan no cambia | ✅ 403 "No tienes permiso para realizar esta acción." en los 12 casos; el plan sigue igual |
| QA-32 | El administrador sí modifica | `PATCH /planes/{id}` (admin) | 200 | ✅ 200 |
| QA-F4 | Pantalla de administración con otros roles (frontend) | Miembro, entrenador y recepción abren `/admin/planes` | Página "Acceso denegado" | ✅ (Chrome) "403 · Acceso denegado" en los 3 roles |

## Pruebas realizadas en cada actividad de H1

Además de QA-1.1, cada actividad de la historia se probó al construirla.

### Actividad 1. Migración de planes, tipos de clase y configuración

**Cómo:** se creó una base vacía nueva (`h1_vacia`) en el Postgres del docker-compose, se aplicaron todas las migraciones con `prisma migrate deploy`, se hicieron inserciones directas en SQL, se ejecutó el `down.sql` y se volvió a aplicar la migración.

| ID | Caso | Esperado | Resultado |
|---|---|---|---|
| DB-01 | Aplicar la migración en una base vacía | Se crean `plan`, `plan_tipo_clase`, `configuracion` y el tipo `tipo_plan` | ✅ |
| DB-02 | Fila inicial de configuración | `precio_clase_puntual = 10.00` | ✅ |
| DB-03 | Planes válidos: Daypass (1 día), Mensual (30 días), Set con 1 y con 100 clases | Se insertan | ✅ Los 4 se insertan |
| DB-04 | Precio 0 y precio negativo | Rechazo por `plan_precio_check` | ✅ Rechazados |
| DB-05 | Set sin cantidad, con 0 y con 101 clases | Rechazo por `plan_cantidad_clases_check` | ✅ Rechazados |
| DB-06 | Mensual o Daypass con cantidad de clases | Rechazo por `plan_cantidad_clases_check` | ✅ Rechazados |
| DB-07 | Daypass de 30 días y Mensual de 1 día | Rechazo por `plan_duracion_dias_check` | ✅ Rechazados |
| DB-08 | Nombre de plan repetido | Rechazo por el índice único `plan_nombre_key` | ✅ Rechazado |
| DB-09 | Relación plan / tipo de clase repetida o con un tipo inexistente | Rechazo por la PK compuesta y la FK | ✅ Rechazados |
| DB-10 | Revertir con `down.sql` | Se eliminan las 3 tablas y el tipo `tipo_plan`; `tipo_clase` (H4) queda intacta | ✅ |
| DB-11 | Volver a aplicar la migración después de revertirla | Se aplica sin errores y vuelve la fila inicial | ✅ |

> La primera versión del CHECK de cantidad dejaba pasar un Set con cantidad nula (en SQL, `NULL BETWEEN 1 AND 100` no es falso). DB-05 lo detectó y se corrigió exigiendo `IS NOT NULL` antes de entregar la migración.

### Actividad 2. Endpoints de planes

**Pruebas unitarias (66), en `src/planes/`:**

| Archivo | Qué cubre |
|---|---|
| `dto/plan.dto.spec.ts` | Cada validación del cuerpo: nombre (vacío, espacios, 60/61 caracteres), tipo, precio (0, negativo, 3 decimales, texto, tope de DECIMAL(10,2)), cantidad de clases (0, 101, decimales), beneficios (vacíos, 500/501), tipos de clase (no lista, ids inválidos o repetidos) y campos fuera del contrato |
| `services/reglas-plan.spec.ts` | Duración según el tipo y regla de cantidad de clases por tipo, al crear y al editar |
| `services/planes.service.spec.ts` | Listar (admin ve todos; los demás, solo activos), crear de cada tipo, editar (solo los campos enviados, tipo ignorado, reemplazo de tipos de clase), desactivar, 400, 404 y 409 |
| `controllers/planes.controller.spec.ts` | `GET /planes` abierto a todos los roles; crear, editar y desactivar solo para ADMINISTRADOR |

**Prueba HTTP contra la base real** (API levantada, peticiones con `curl` usando los tokens del seed):

| Caso | Resultado |
|---|---|
| `GET /planes` sin token | ✅ 401 |
| `POST /planes` como miembro y como recepción | ✅ 403 |
| Crear Mensual con 2 tipos de clase, Set de 10 clases y Daypass | ✅ 201, con duración 30 / 30 / 1 |
| Nombre repetido en minúsculas | ✅ 409 "Ya existe un plan con ese nombre" |
| Set sin cantidad / Daypass con cantidad / precio 0 / tipo de clase inexistente | ✅ 400 con su mensaje |
| `PATCH` como miembro | ✅ 403 |
| `PATCH` enviando `tipo: DAYPASS` sobre un Mensual | ✅ 200, sigue Mensual |
| `PATCH` con nombre de otro plan / cantidad en un Mensual / quitar la cantidad a un Set | ✅ 409 / 400 / 400 |
| `PATCH` a un plan inexistente / con id inválido | ✅ 404 / 400 |
| Desactivar como recepción / como admin / por segunda vez | ✅ 403 / 200 / 409 |
| Listado: admin ve el plan inactivo; miembro solo los activos | ✅ |

### Actividad 3. Precio de la clase puntual

**Pruebas unitarias (15), en `src/configuracion/`:** validación del precio (0, negativo, 3 decimales, texto, nulo, ausente, tope; un solo mensaje de error), `obtenerPrecioClasePuntual()` (valor guardado y error si falta la fila), guardado con 2 decimales (`12.5` → `"12.50"`) y permisos del controlador (GET abierto, PUT solo ADMINISTRADOR).

**Prueba HTTP contra la base real:**

| Caso | Resultado |
|---|---|
| `GET` sin token | ✅ 401 |
| `GET` como miembro, entrenador, recepción y admin | ✅ 200 `{ "precio": "10.00" }` |
| `PUT` como miembro, entrenador y recepción | ✅ 403 |
| `PUT` con `0`, `-3`, `12.555`, `"12.50"` (texto), sin precio y con un campo extra | ✅ 400, con un único mensaje |
| `PUT { precio: 12.5 }` como admin | ✅ 200 `{ "precio": "12.50" }`; el `GET` siguiente devuelve `12.50` y `actualizado_en` cambia en la base |

### Actividad 4. Pantalla de administración de planes (frontend)

**Cómo:** frontend con `npm run dev` contra la API local, recorrido automatizado en Google Chrome (sin interfaz) iniciando sesión como administrador, a 1280 px y a 375 px de ancho.

| Caso | Resultado |
|---|---|
| Sin planes se muestra "Aún no hay planes" | ✅ |
| Guardar el formulario vacío muestra el error bajo Nombre, Tipo, Precio y Beneficios, sin llamar a la API | ✅ |
| Crear un Mensual con 2 tipos de clase | ✅ "Plan guardado" |
| "Cantidad de clases" solo aparece al elegir "Set de clases mensual" | ✅ |
| Precio con 3 decimales y 150 clases muestran el error bajo cada campo | ✅ |
| Nombre repetido: el error del backend aparece bajo Nombre | ✅ "Ya existe un plan con ese nombre" |
| Al editar, el Tipo está deshabilitado | ✅ |
| Desactivar pide la confirmación "¿Desactivar el plan {nombre}? No estará disponible para nuevas compras ni renovaciones." | ✅ Texto exacto |
| Al confirmar se muestra "Plan desactivado" y el plan pasa a "Inactivo" sin el botón Desactivar | ✅ |
| A 375 px la página no se desplaza a lo ancho | ✅ |

**Cómo se ve a 1280 px:** menú lateral a la izquierda con "Planes" resaltado. Arriba, el título "Planes", una línea de descripción y el botón negro "Nuevo plan" a la derecha. Debajo, la tabla con borde gris claro y las columnas Nombre, Tipo, Precio (`$40.00`), Clases incluidas (número o `—`), Tipos de clase (separados por coma) y Estado: etiqueta verde "Activo" o gris "Inactivo". A la derecha de cada fila, los botones "Editar" y "Desactivar". Los planes inactivos se ven en gris. El formulario se abre en una ventana centrada sobre un fondo oscurecido. El tipo y el precio van lado a lado, los contadores de caracteres (`13/60`, `26/500`) van bajo Nombre y Beneficios, y los tipos de clase son casillas en dos columnas. Los errores aparecen en rojo bajo cada campo, con el borde del campo en rojo. Los avisos ("Plan guardado", "Plan desactivado") salen en una franja verde oscuro arriba al centro y se cierran solos.

**Cómo se ve a 375 px:** el menú lateral se oculta (comportamiento del Shell del Módulo 0). La tabla se reemplaza por una tarjeta por plan con el nombre, "Tipo · Precio", la etiqueta de estado a la derecha, las filas "Clases incluidas" y "Tipos de clase", y los botones "Editar" y "Desactivar" ocupando el ancho. El formulario sube desde abajo, ocupa todo el ancho y se puede desplazar. Los campos van uno debajo del otro.

### Actividad 5. Tarjeta "Precio de la clase puntual" (frontend)

**Cómo:** igual que la actividad 4, en Chrome a 1280 px y 375 px.

| Caso | Resultado |
|---|---|
| La tarjeta aparece sobre la tabla con el valor actual (`$10.00`) y el botón Editar | ✅ |
| Al editar, el campo es numérico y tiene el prefijo `$` | ✅ |
| Guardar `0`, `-1`, `12.555` o vacío muestra "El precio debe ser mayor que 0 y tener como máximo 2 decimales." y no guarda | ✅ |
| Guardar `12.5` muestra "Precio actualizado. Se aplicará a las sesiones que se agenden desde ahora" y la tarjeta pasa a `$12.50` | ✅ |
| Al recargar la página se mantiene `$12.50` | ✅ |
| A 375 px la página no se desplaza a lo ancho | ✅ |

**Cómo se ve:** es una tarjeta con borde gris claro entre el título "Planes" y la tabla. A la izquierda tiene el rótulo gris "Precio de la clase puntual" y debajo el valor en grande (`$10.00`); a la derecha, el botón "Editar". Al editar, el valor se reemplaza por un campo con `$` fijo a la izquierda y los botones "Cancelar" y "Guardar" (negro) al lado; el error aparece en rojo debajo del campo. A 375 px el campo ocupa todo el ancho y los dos botones quedan debajo, repartidos a la mitad.

> Al terminar cada prueba se borraron los planes creados y el precio volvió a `10.00`.

## Resumen

| Criterio | Casos | Resultado |
|---|---|---|
| 1. Registrar planes de los 3 tipos | QA-01 a QA-04 | ✅ |
| 2. Duraciones y sets de 1 a 100 clases | QA-05 a QA-10 | ✅ |
| 3. Precio de la clase puntual | QA-11 a QA-14 (QA-M1 pendiente de H9) | ✅ |
| 4. Editar sin afectar membresías ni cobros; tipo fijo | QA-15 a QA-18 (QA-M2 pendiente de H2) | ✅ |
| 5. Desactivar sin afectar lo vendido | QA-19 a QA-22 (QA-M3 pendiente de H2) | ✅ |
| 6. Validaciones y errores por campo | QA-23 a QA-28, QA-F1 a QA-F3 | ✅ |
| 7. Solo ADMINISTRADOR modifica | QA-29 a QA-32, QA-F4 | ✅ |

- `npm run test:e2e`: **64/64** (45 de H1 + los existentes).
- `npm test`: **233/233** (incluye 81 pruebas unitarias de H1: crear, editar, desactivar y cada validación).
- `npm run lint` y `npm run build`: sin errores.
- Pantalla `/admin/planes` y tarjeta del precio revisadas a **375 px** y **1280 px** (actividades 4 y 5).
- Pendientes manuales QA-M1 (H9), QA-M2 y QA-M3 (H2): dependen de historias que todavía no existen; los puntos de integración ya están probados (QA-13, QA-17, QA-19, QA-20).
