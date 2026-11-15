# QA-2.1. Pruebas del registro de compra o renovación de membresía

**Historia:** H2. Registro de compra o renovación de membresía
**Responsable:** _(completar)_
**Fecha de ejecución:** 15/11/2026
**Entorno:** API local (puerto 8000), PostgreSQL 18 del docker-compose, datos de `npm run db:seed`; frontend con `npm run dev` (puerto 3000) y Google Chrome.
**Herramientas:** pruebas e2e con Vitest + Supertest (`npm run test:e2e`), pruebas unitarias (`npm test`), consultas SQL directas y revisión en el navegador.

## Cómo ejecutar

```bash
docker compose up -d postgres
npm run prisma:deploy && npm run db:seed
npm run test:e2e
```

Los casos QA-01 a QA-26 están automatizados en [test/membresias.e2e-spec.ts](../../test/membresias.e2e-spec.ts):

- Levantan la API real, con el mismo prefijo `api/v1` y el mismo `ValidationPipe` que `main.ts`.
- Crean **sus propios miembros y planes** (prefijo `[QA-2.1]`) y los borran al terminar, junto con sus membresías y cobros.
- **Reloj simulado:** se fija la fecha del servidor con `vi.setSystemTime`, de modo que "hoy" es el **16/11/2026** en El Salvador. Para el pago tardío (QA-14) el reloj se adelanta 12 días. Solo se simula `Date`, así los temporizadores de la base siguen funcionando.
- **Pago aprobado:** el Módulo 5 lo confirma llamando a `MembresiasService.aplicarPago()`, y eso es lo que se prueba. La pasarela simulada (tarjeta terminada en 0002) llega con H12; ver los casos manuales QA-M1 y QA-M2.

> `vitest.config.e2e.ts` ejecuta los archivos e2e **de a uno** (`fileParallelism: false`). Todos escriben en la misma base, y en paralelo QA-1.1 (H1) veía los datos que QA-2.1 creaba al mismo tiempo: falló en 5 de 5 corridas. Con el cambio pasan 98/98 en 5 de 5 corridas.

## Datos de prueba

| Dato | Valor |
|---|---|
| Recepción | recepcion@madlions.com / `Demo1234!` |
| Administrador | admin@madlions.com / `Demo1234!` |
| Entrenador | entrenador@madlions.com / `Demo1234!` |
| Miembro | miembro@madlions.com / `Demo1234!` |
| Miembros de la prueba | 14 creados por la prueba (`Prueba QA21 <corrida> <n>`), uno por caso |
| Planes de la prueba | Daypass $5 (1 día), Mensual $35.50 (30 días), Set de 10 clases $50 (30 días) y un Mensual inactivo |
| "Hoy" simulado | 16/11/2026 (UTC-6) |

## Casos de prueba por criterio de aceptación

### Criterio 1. Búsqueda por nombre, documento o código, hasta 20 coincidencias

| ID | Caso | Petición | Esperado | Resultado |
|---|---|---|---|---|
| QA-01 | Por nombre | `GET /miembros/buscar?q=qa21 <corrida>` (recepción) | Los 14, con nombre, código, documento y estado | ✅ 14 resultados con id, nombre, apellido, codigo, documento, estadoMembresia y fechaVencimiento |
| QA-02 | Por documento y por código | `q=<documento>` y `q=<código en minúsculas>` | Solo ese miembro | ✅ |

### Criterio 2. Fecha de inicio (hoy a hoy + 30) y resumen

| ID | Caso | Petición | Esperado | Resultado |
|---|---|---|---|---|
| QA-03 | Resumen completo, sin guardar | `GET /membresias/resumen` (Mensual, sin fecha) | Miembro, plan, precio, beneficios, duración, `COMPRA`, inicio hoy y vencimiento hoy + 29; nada guardado | ✅ |
| QA-04 | Compra de cada tipo con inicio hoy y a 10 días | `POST /membresias` Daypass, Mensual y Set, cada uno con hoy y con hoy + 10 | 201 `PENDIENTE_PAGO`; Daypass vence el mismo día y los demás a +29 | ✅ 6 de 6 |
| QA-05 | Inicio ayer y a 31 días | Resumen y `POST` | 400 "La fecha de inicio debe estar entre hoy y los próximos 30 días"; nada guardado | ✅ |
| QA-06 | Plan inactivo, miembro o plan inexistente | Resumen | 409 / 404 / 404 | ✅ |

### Criterio 3. Compra o renovación

| ID | Caso | Petición | Esperado | Resultado |
|---|---|---|---|---|
| QA-07 | **Renovación de una membresía vigente** | Mensual pagado hoy (vence hoy + 29); resumen y `POST` del mismo plan enviando hoy + 5 | `RENOVACION`, la fecha enviada se ignora, inicio **hoy + 30** fijo, enlazada a la anterior | ✅ |
| QA-08 | Renovación de una vencida del mismo plan | Set vencido hace 31 días; resumen con hoy + 3 | `RENOVACION` con la fecha elegida | ✅ |
| QA-09 | Otro plan, o Daypass con otro Daypass pagado | Resumen | `COMPRA` | ✅ |

### Criterio 4. Queda "Pendiente de pago" con las condiciones del plan, y el Módulo 5 genera el cobro

| ID | Caso | Verificación | Esperado | Resultado |
|---|---|---|---|---|
| QA-10 | Membresía guardada | Fila en `membresia` y `membresia_tipo_clase` | `PENDIENTE_PAGO` con copia del nombre, tipo, precio, clases y tipos de clase; fecha elegida; `registrada_por` = recepción; sin fechas de cobertura | ✅ |
| QA-11 | Cobro pendiente | Fila en `cobro` | `PENDIENTE`, concepto `MEMBRESIA`, monto = precio, referencia a la membresía | ✅ |
| QA-12 | Editar el plan después de vendido | `PATCH /planes/{id}` (admin) con precio 99 | La membresía conserva $50 | ✅ (también cubre QA-M2 de H1) |

> Recepción no registra pagos en efectivo: la API no tiene ninguna ruta para que recepción marque un pago. El único camino es `aplicarPago()`, que llama el Módulo 5.

### Criterio 5. Pago aprobado: pasa a "Pagada" y la cobertura empieza en la fecha correcta

| ID | Caso | Verificación | Esperado | Resultado |
|---|---|---|---|---|
| QA-13 | Pago antes de la fecha elegida | Elegida hoy + 10, pagada hoy | Inicio hoy + 10, vence hoy + 39 | ✅ |
| QA-14 | **Pago aprobado después de la fecha elegida** | Elegida hoy; **reloj adelantado a hoy + 12, 18:30** | Inicia **el día del pago** (hoy + 12), vence hoy + 41; estado `VIGENTE` con 29 días | ✅ |
| QA-15 | Créditos del set | Set pagado; `obtenerEstado()` | 10 créditos totales y 10 disponibles | ✅ |
| QA-16 | Renovación de una vigente, pagada antes de vencer | Renovación de QA-07 pagada en hoy + 20 | Inicio hoy + 30 (sin huecos); el estado muestra la actual `VIGENTE` y la renovación `POR_INICIAR` | ✅ |

### Criterio 6. Pago rechazado: sigue "Pendiente de pago" sin cobertura

| ID | Caso | Verificación | Esperado | Resultado |
|---|---|---|---|---|
| QA-17 | El Módulo 5 informa un rechazo (no llama a `aplicarPago`) | Membresía, cobro y estado del miembro | Sigue `PENDIENTE_PAGO`, sin fechas ni referencia; cobro `PENDIENTE`; estado `PENDIENTE_PAGO` | ✅ |
| QA-M1 | **Manual, pendiente de H12:** pagar con la tarjeta terminada en **0002** en la pasarela simulada | Desde "Mis pagos" del miembro | La pasarela rechaza; la membresía sigue "Pendiente de pago" y no se activa ni se extiende ninguna cobertura | ⏳ Pendiente: la pasarela simulada llega con H12 |

### Criterio 7. Operación pendiente duplicada y fechas fuera de rango

| ID | Caso | Petición | Esperado | Resultado |
|---|---|---|---|---|
| QA-18 | Segunda operación con otra pendiente | Resumen y `POST` | 409 "El miembro ya tiene una compra o renovación pendiente de pago"; sigue habiendo una sola | ✅ |
| QA-19 | 4 registros simultáneos del mismo miembro | 4 `POST` a la vez | 1 × 201 y 3 × 409; una membresía y un cobro | ✅ |
| (QA-05) | Fecha ayer o a 31 días | Ver criterio 2 | 400 con el mensaje del criterio | ✅ |

### Criterio 8. La misma confirmación de pago dos veces se aplica una sola vez

| ID | Caso | Verificación | Esperado | Resultado |
|---|---|---|---|---|
| QA-20 | Misma referencia dos veces (la segunda con otra fecha) | `aplicarPago()` ×2 | La primera aplica, la segunda no hace nada; las fechas no cambian | ✅ |
| QA-21 | 3 confirmaciones simultáneas | `aplicarPago()` ×3 a la vez | Se aplica una sola | ✅ |
| QA-22 | Otra referencia sobre una ya pagada | `aplicarPago()` | 409 | ✅ |
| QA-M2 | **Manual, pendiente de H12:** la pasarela envía dos veces la misma confirmación | Repetir la notificación del pago aprobado | Se aplica una vez | ⏳ Pendiente de H12 (la regla ya está probada en QA-20 y QA-21) |

### Criterio 9. Miembro, entrenador o administrador reciben "Acceso denegado"

| ID | Caso | Petición | Esperado | Resultado |
|---|---|---|---|---|
| QA-23 | Sin sesión | `POST /membresias` | 401 | ✅ |
| QA-24 | MIEMBRO, ENTRENADOR y ADMINISTRADOR | Resumen y `POST /membresias` | 403 en los 6 casos; nada guardado | ✅ |
| QA-25 | Búsqueda con otros roles | MIEMBRO / ENTRENADOR | 403 / solo id, nombre, apellido y código | ✅ |
| QA-26 | RECEPCION sí registra | `POST /membresias` | 201 | ✅ |
| QA-F1 | Pantalla con otros roles (frontend) | Admin, entrenador y miembro abren `/recepcion/membresias` | "403 · Acceso denegado" | ✅ (Chrome) |

## Pruebas realizadas en cada actividad de H2

### Actividad 1. Migración de membresías

**Cómo:** se aplicaron todas las migraciones en una base vacía nueva (`h2_vacia`) con el seed, se insertó en SQL, se revirtió con `down.sql` y se volvió a aplicar.

| Caso | Resultado |
|---|---|
| Se crean `membresia`, `membresia_tipo_clase`, los enum y los índices (incluido el único parcial) | ✅ |
| 7 casos válidos: compra pendiente, set pagado, renovación, tipos de clase y una nueva pendiente después de pagar | ✅ Aceptados |
| Segunda PENDIENTE_PAGO del mismo miembro | ✅ Rechazada por `membresia_miembro_pendiente_pago_key` |
| Precio 0, set sin cantidad, mensual con cantidad | ✅ Rechazados por los CHECK |
| Pendiente con fecha de inicio, pagada sin fechas, vencimiento antes del inicio | ✅ Rechazados por `membresia_fechas_check` |
| Renovación sin anterior, o con la anterior igual a sí misma | ✅ Rechazadas por `membresia_renovacion_check` |
| Referencia de pago repetida, miembro inexistente, tipo de clase repetido | ✅ Rechazados |
| Borrar un plan con membresías, o una membresía ya renovada | ✅ Rechazado (RESTRICT) |
| Editar el plan no cambia la copia de la membresía | ✅ |
| `down.sql` revierte sin errores y deja `plan`, `tipo_clase` y `miembro`; se vuelve a aplicar | ✅ |
| Prisma no intenta borrar el índice parcial en migraciones futuras | ✅ (el drift solo muestra el índice de H16, que ya existía) |

### Actividad 2. Búsqueda de miembros

- **Pruebas unitarias (21):** validación de `q` (2 a 50 caracteres, un solo mensaje), normalización (mayúsculas, tildes, ñ y comodines), campos según el rol y permisos.
- **Prueba HTTP en una base con 1.003 miembros:**

| Caso | Resultado |
|---|---|
| Sin token / MIEMBRO | ✅ 401 / 403 |
| `q` de 1 carácter, de 51 o solo espacios | ✅ 400 con un solo mensaje |
| "maria", "MARÍA", "lopez maria", "maría lópez" | ✅ Encuentra a María López |
| "nunez" y "núñez" | ✅ Mismos resultados (máximo 20) |
| Documento exacto / parcial; código en minúsculas / parcial | ✅ Encuentra / no encuentra; encuentra / no encuentra |
| `%%` | ✅ No trae a todos |
| ENTRENADOR | ✅ Solo id, nombre, apellido y código |
| **Rendimiento:** peor tiempo de 10 búsquedas de cada tipo | ✅ **0,016 s** (el criterio pide < 1 s) |

### Actividad 3. Registro de compra o renovación con cobro

- **Pruebas unitarias (33):** 16 de la regla compra/renovación (Daypass siempre compra, renovación vigente y vencida, rango de fechas, vencimiento) y las del servicio, el DTO, el controlador y `CobrosService`.
- **Prueba HTTP** en una base aparte: acceso, validaciones, compra, las dos renovaciones y otro plan.
- **Si falla el cobro no queda la membresía:** con un CHECK que hacía fallar `cobro`, el `POST` respondió 500 y **no quedó la membresía**.
- **4 registros simultáneos:** 1 registrado y 3 × 409. El log confirmó que el índice parcial los frenó y se tradujeron a 409, no a 500.
- La migración de `cobro` se aplicó, se revirtió y se volvió a aplicar en una base vacía.

### Actividad 4. Aplicar el pago

- **Pruebas unitarias (15):** pago antes, el mismo día y después de la fecha solicitada; renovación de una membresía vigente; borde UTC-6 (21:00 en El Salvador sigue siendo el mismo día); Daypass; idempotencia; errores.
- **Contra la base real** (la app sin HTTP, llamando al método como lo hará el Módulo 5): antes / después / la misma referencia dos veces / otra referencia / una referencia usada en otra membresía / **4 confirmaciones simultáneas → se aplicó 1**.

### Actividad 5. Estado de la membresía (BE-2.4)

- **Pruebas unitarias:** cada estado y el **límite de 3 días**: 4 días es `VIGENTE`; 3, 2, 1 y 0 son `PROXIMA_A_VENCER`; al día siguiente es `VENCIDA`. También la renovación, los créditos y la fecha de corte en UTC-6.
- **Contra la base real:** 7 miembros, uno por situación. Los 7 dieron el estado esperado con `obtenerEstado()`, y la búsqueda HTTP mostró los estados nuevos.

### Actividad 6. Pantalla de recepción (frontend)

**Cómo:** frontend con `npm run dev` contra la API de H2, recorrido automatizado en Google Chrome (sin interfaz) con recepción, a 1280 px y a 375 px.

| Caso | Resultado |
|---|---|
| Búsqueda de 1 letra muestra el error; "zzzz" muestra "No se encontraron miembros" | ✅ |
| Las tarjetas muestran nombre, código, documento y estado con su color | ✅ |
| Solo aparecen los planes activos (el inactivo no) | ✅ |
| Resumen de compra con hoy por defecto; con hoy + 10 se recalcula el vencimiento | ✅ |
| Hoy + 31 muestra el error del rango y desactiva Confirmar | ✅ |
| **3 clics rápidos en Confirmar → un solo registro en la base** | ✅ El botón pasa a "Registrando…" |
| Mensaje "Operación registrada. Estado: Pendiente de pago. El miembro paga desde su cuenta en Mis pagos." | ✅ |
| Volver a registrar al mismo miembro muestra el 409 del backend en pantalla y desactiva Confirmar | ✅ |
| Renovación de una vigente: etiqueta "Renovación" y fecha fija (vencimiento + 1) deshabilitada | ✅ |
| A 375 px la página no se desplaza a lo ancho | ✅ |

**Cómo se ve a 1280 px:** el menú lateral a la izquierda, con "Compras y renovaciones" resaltado. Arriba, el título y una línea de ayuda. Hay tres pasos numerados con un círculo negro:

1. **Miembro:** el buscador con el botón negro "Buscar". Los resultados van en tarjetas de borde gris claro, en tres columnas. Cada tarjeta muestra el nombre, "código · documento", la etiqueta de estado con su color y "Vence el dd/mm/aaaa". Los colores son verde para Vigente, ámbar para Próxima a vencer, celeste para Por iniciar, naranja para Pendiente de pago, rojo para Vencida y gris para Sin membresía. Al elegir un miembro, su tarjeta queda con borde negro y el botón "Cambiar miembro".
2. **Plan:** tarjetas de los planes activos con el nombre, el tipo, el precio en grande, "IVA incluido" y los beneficios. El plan elegido queda con borde negro.
3. **Fecha de inicio y resumen:** el selector de fecha con la ayuda "De hoy al dd/mm/aaaa". En la renovación de una vigente el selector aparece gris y deshabilitado, con la explicación debajo. Más abajo va el resumen con la etiqueta "Compra" (negra) o "Renovación" (celeste), una lista de dos columnas con los datos, y el botón negro "Confirmar" a la derecha.

Los errores del backend aparecen en un recuadro rojo claro. Al confirmar, toda la pantalla pasa a un recuadro verde claro con el mensaje, el miembro, la operación, la etiqueta naranja "Pendiente de pago" y el botón "Registrar otra operación".

**Cómo se ve a 375 px:** el menú lateral se oculta (comportamiento del Shell del Módulo 0). Las tarjetas de miembros y planes van una debajo de otra, a todo el ancho. "Cambiar miembro" queda debajo de los datos del miembro. El resumen se muestra en una sola columna (rótulo arriba y valor abajo) y "Confirmar" ocupa todo el ancho.

## Resumen

| Criterio | Casos | Resultado |
|---|---|---|
| 1. Búsqueda (hasta 20, con estado) | QA-01, QA-02 | ✅ |
| 2. Fecha de inicio y resumen | QA-03 a QA-06 | ✅ |
| 3. Compra o renovación | QA-07 a QA-09 | ✅ |
| 4. Pendiente de pago con condiciones y cobro | QA-10 a QA-12 | ✅ |
| 5. Pago aprobado y cobertura | QA-13 a QA-16 | ✅ |
| 6. Pago rechazado | QA-17 (QA-M1 pendiente de H12) | ✅ |
| 7. Pendiente duplicada y fechas | QA-18, QA-19, QA-05 | ✅ |
| 8. Confirmación repetida | QA-20 a QA-22 (QA-M2 pendiente de H12) | ✅ |
| 9. Acceso denegado | QA-23 a QA-26, QA-F1 | ✅ |

- `npm run test:e2e`: **98/98** (34 de H2), estable en 5 corridas seguidas.
- `npm test`: **318/318**.
- `npm run lint` y `npm run build`: sin errores.
- Pantalla `/recepcion/membresias` revisada a **375 px** y **1280 px**.
- Pendientes manuales QA-M1 y QA-M2: dependen de la pasarela simulada de H12. El punto de integración (`aplicarPago`) ya está probado.
