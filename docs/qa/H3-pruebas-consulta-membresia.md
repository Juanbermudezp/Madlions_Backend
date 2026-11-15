# QA-3.1. Pruebas de la consulta del estado de mi membresía

**Historia:** H3. Consulta del estado de mi membresía
**Responsable:** _(completar)_
**Fecha de ejecución:** 15/11/2026
**Entorno:** API local (puerto 8000), PostgreSQL 18 del docker-compose, datos de `npm run db:seed`; frontend con `npm run dev` (puerto 3000) y Google Chrome.
**Herramientas:** pruebas e2e con Vitest + Supertest (`npm run test:e2e`), pruebas unitarias (`npm test`) y revisión en el navegador.

## Cómo ejecutar

```bash
docker compose up -d postgres
npm run prisma:deploy && npm run db:seed
npm run test:e2e
```

Los casos QA-01 a QA-13 están automatizados en [test/consulta-membresia.e2e-spec.ts](../../test/consulta-membresia.e2e-spec.ts):

- Usan los **miembros de prueba del script de datos iniciales** ([prisma/seed-membresias.ts](../../prisma/seed-membresias.ts)), uno por estado.
- Antes de empezar los refrescan con la misma función del seed, así las fechas siempre son relativas a hoy.
- **Set con 3 reservas:** la tabla `reserva` llega con H5. Se simula solo el método que cuenta las reservas confirmadas (`MembresiaRepository.contarReservasConfirmadas`, aislado para H5); la consulta, el cálculo y la respuesta son reales. Con reservas reales queda como caso manual QA-M1, pendiente de H5.

## Datos de prueba (script de datos iniciales)

`npm run db:seed` crea, o refresca con fechas relativas a hoy, estos miembros (contraseña `Demo1234!`):

| Usuario | Membresía | Estado esperado |
|---|---|---|
| estado.vigente@madlions.com | Set 8 clases (prueba): inició hace 9 días, vence en 20 | Vigente, 8 créditos |
| estado.proxima@madlions.com | Mensual (prueba): vence en 2 días | Próxima a vencer |
| estado.poriniciar@madlions.com | Mensual pagada que empieza en 4 días | Por iniciar |
| estado.pendiente@madlions.com | Compra Mensual sin pagar (inicio solicitado en 2 días), con su cobro | Pendiente de pago |
| estado.vencida@madlions.com | Mensual que venció hace 5 días | Vencida |
| estado.renovacion.pendiente@madlions.com | Mensual vigente (vence en 9 días) + renovación sin pagar | Vigente + renovación pendiente de pago |
| estado.renovacion.pagada@madlions.com | Mensual que vence mañana + renovación pagada que empieza en 2 días | Próxima a vencer + renovación pagada |
| estado.sinmembresia@madlions.com | Ninguna | Sin membresía |

Cada corrida del seed borra y vuelve a crear las membresías y los cobros **solo de estos usuarios**. No toca a ningún otro usuario del seed.

## Casos de prueba por criterio de aceptación

### Criterio 1. Plan, tipo, estado, fechas y días restantes

| ID | Caso | Petición | Esperado | Resultado |
|---|---|---|---|---|
| QA-01 | Vigente | `GET /membresias/mia` (estado.vigente) | Plan, `SET_CLASES`, `VIGENTE`, inicio hoy − 9, vencimiento hoy + 20, 20 días | ✅ |
| QA-02 | Próxima a vencer, Por iniciar, Pendiente de pago, Vencida | `GET /membresias/mia` con cada usuario | El estado y las fechas de cada uno; días restantes solo cuando está cubierta | ✅ 4 de 4 |
| QA-F1 | En pantalla | `/miembro/membresia` con cada usuario | Plan, tipo, etiqueta de estado con su color, fechas dd/mm/aaaa y días restantes | ✅ (Chrome, 375 px) |

### Criterio 2. En sets, los créditos restantes

| ID | Caso | Verificación | Esperado | Resultado |
|---|---|---|---|---|
| QA-03 | Set de 8 clases con **3 reservas confirmadas** | `GET /membresias/mia` (estado.vigente) | `creditosTotales: 8`, `creditosDisponibles: 5` ("5 de 8 clases disponibles") | ✅ |
| QA-04 | Plan que no es set | `GET /membresias/mia` (estado.proxima) | Sin créditos (`null`) | ✅ |
| QA-F2 | En pantalla | estado.vigente | Barra de créditos con "8 de 8 clases disponibles" (sin reservas reales) | ✅ (Chrome) |
| QA-M1 | **Manual, pendiente de H5:** reservar 3 clases con el set y abrir "Mi membresía" | Con la tabla `reserva` de H5 | "5 de 8 clases disponibles" | ⏳ Pendiente de H5 |

### Criterio 3. Aviso de "Próxima a vencer"

| ID | Caso | Verificación | Esperado | Resultado |
|---|---|---|---|---|
| QA-05 | API | estado.proxima | `PROXIMA_A_VENCER`, vencimiento hoy + 2, sin renovación | ✅ |
| QA-F3 | En pantalla | estado.proxima | Aviso amarillo "Tu membresía vence el dd/mm/aaaa. Acércate a recepción para registrar tu renovación." | ✅ (Chrome) |

### Criterio 4. Renovación registrada

| ID | Caso | Verificación | Esperado | Resultado |
|---|---|---|---|---|
| QA-06 | Renovación pendiente de pago | estado.renovacion.pendiente | `renovacion: { estado: PENDIENTE_PAGO, fechaInicio: hoy + 10 }` | ✅ |
| QA-07 | Renovación pagada | estado.renovacion.pagada | `renovacion: { estado: POR_INICIAR, fechaInicio: hoy + 2 }` | ✅ |
| QA-F4 | En pantalla | Los dos usuarios | "Renovación pendiente de pago" con el botón **Ir a Mis pagos** (`/miembro/pagos`); "Renovación pagada: inicia el dd/mm/aaaa" | ✅ (Chrome) |

### Criterio 5. Vencida

| ID | Caso | Verificación | Esperado | Resultado |
|---|---|---|---|---|
| QA-08 | API | estado.vencida | `VENCIDA`, vencimiento hoy − 5 | ✅ |
| QA-F5 | En pantalla | estado.vencida | "Tu membresía venció el dd/mm/aaaa" **en rojo** | ✅ (Chrome, color `red-600`) |

### Criterio 6. Nunca tuvo una membresía

| ID | Caso | Verificación | Esperado | Resultado |
|---|---|---|---|---|
| QA-09 | API | estado.sinmembresia | `SIN_MEMBRESIA` con todos los demás campos en `null` | ✅ |
| QA-F6 | En pantalla | estado.sinmembresia | "No tienes una membresía. Acércate a recepción para adquirir un plan." | ✅ (Chrome) |

### Criterio 7. Solo la membresía del usuario autenticado

| ID | Caso | Petición | Esperado | Resultado |
|---|---|---|---|---|
| QA-10 | **Consultar la membresía de otro miembro** | `GET /membresias/{id de estado.vigente}` con estado.vencida | 403 "No tienes permiso para ver esta membresía." | ✅ |
| QA-11 | La propia por id | `GET /membresias/{id propio}` | 200 | ✅ |
| QA-12 | `/mia` con el id de otro miembro | `GET /membresias/mia?miembroId={estado.vigente}` con estado.sinmembresia | Se ignora el parámetro: `SIN_MEMBRESIA` (la propia) | ✅ |
| QA-13 | Sin sesión | `GET /membresias/mia` | 401 | ✅ |
| QA-F7 | Otros roles en la pantalla | Recepción y admin abren `/miembro/membresia` | "403 · Acceso denegado" | ✅ (Chrome) |

## Pruebas realizadas en cada actividad de H3

### Actividad 1. Endpoint de la membresía del miembro autenticado

- **Pruebas unitarias:**
  - el servicio: usa el usuario del token, responde con todo en `null` si el usuario no tiene ficha, 404 y **403 con otro dueño**;
  - el controlador: solo MIEMBRO, y `/mia` no recibe ningún id.
- **Pruebas e2e** ([test/membresia-propia.e2e-spec.ts](../../test/membresia-propia.e2e-spec.ts)), con María y Usuario Demo del seed:

| Caso | Resultado |
|---|---|
| `/mia` devuelve el objeto completo de BE-2.4 (set vigente, 20 días, 8 de 8 créditos) | ✅ |
| `/mia?miembroId=<de otro>` ignora el parámetro | ✅ |
| Sin membresía → `SIN_MEMBRESIA` con los 10 campos restantes en `null` | ✅ |
| **403 con la membresía de otro miembro, en los dos sentidos**; el 403 no filtra datos ajenos | ✅ |
| 401 sin sesión, 403 para RECEPCION, 404 si no existe, 400 si el id no es válido | ✅ |

### Actividad 2. Vista "Mi membresía" (frontend)

**Cómo:** frontend con `npm run dev`, recorrido automatizado en Google Chrome (sin interfaz) con 8 miembros de prueba, uno por situación, a 375 px y a 1280 px.

| Caso | Resultado |
|---|---|
| Los 8 estados muestran el color, las fechas, el mensaje y el enlace que corresponden | ✅ |
| Los créditos se muestran solo con la membresía pagada (no en una compra pendiente) | ✅ |
| **Error con Reintentar:** con la consulta fallando se ve "No se pudo cargar tu membresía" y Reintentar; al restaurar, Reintentar carga la tarjeta | ✅ |
| Carga: se muestra "Cargando tu membresía…" mientras responde la API (`loading.tsx`) | ✅ |
| 375 px sin desborde horizontal en los 8 casos; 1280 px | ✅ |

**Cómo se ve a 375 px:**
- **Arriba:** el nombre del miembro y "Cerrar sesión". El menú lateral se oculta en móvil (comportamiento del Shell del Módulo 0). Luego van el título "Mi membresía" y la línea "Estado de tu membresía y cuándo debes renovarla".
- **La tarjeta:** borde gris claro. Lleva el nombre del plan en negrita, el tipo debajo y, a la derecha, la etiqueta del estado: verde Vigente, amarilla Próxima a vencer, azul Por iniciar, gris Pendiente de pago o roja Vencida. Debajo, en dos columnas, "Fecha de inicio" y "Fecha de vencimiento", y abajo "Días restantes" en negrita.
- **En los sets:** una línea separa la sección "Créditos de clases" con el texto "8 de 8 clases disponibles" y una barra negra que se llena según los créditos.
- **Debajo de la tarjeta, según el caso:**
  - Próxima a vencer: el aviso en un recuadro amarillo claro.
  - Vencida: el texto en rojo.
  - Pendiente de pago: un recuadro con "Tu compra está pendiente de pago. Ir a Mis pagos".
  - Con renovación: un recuadro "Renovación" con el texto que corresponde y, si está pendiente, el botón negro "Ir a Mis pagos".
- **Sin membresía:** solo un recuadro de borde punteado con el mensaje.
- **Si falla la carga:** un recuadro rojo claro con el mensaje y el botón negro "Reintentar".

**Cómo se ve a 1280 px:** igual, con el menú lateral a la izquierda ("Mi membresía" resaltado). La tarjeta ocupa hasta 2/3 del ancho y las tres fechas van en una sola fila.

### Actividad 3. Verificación de los 7 criterios (esta)

- Se agregaron los miembros de prueba al script de datos iniciales: `prisma/seed-membresias.ts` y 3 líneas en `prisma/seed.ts`. El seed es idempotente: corrido dos veces deja siempre 8 usuarios, 9 membresías y 2 cobros, con las fechas refrescadas.
- Prueba e2e QA-01 a QA-13 y revisión en Chrome de los mensajes (QA-F1 a QA-F7).

## Resumen

| Criterio | Casos | Resultado |
|---|---|---|
| 1. Plan, tipo, estado, fechas y días | QA-01, QA-02, QA-F1 | ✅ |
| 2. Créditos en sets | QA-03, QA-04, QA-F2 (QA-M1 pendiente de H5) | ✅ |
| 3. Aviso de próxima a vencer | QA-05, QA-F3 | ✅ |
| 4. Renovación registrada | QA-06, QA-07, QA-F4 | ✅ |
| 5. Vencida en rojo | QA-08, QA-F5 | ✅ |
| 6. Sin membresía | QA-09, QA-F6 | ✅ |
| 7. Solo la propia membresía | QA-10 a QA-13, QA-F7 | ✅ |

- `npm run test:e2e`: **122/122** (16 de QA-3.1 y 8 de la actividad 1), estable en 2 corridas.
- `npm test`: **326/326**.
- `npm run lint` y `npm run build`: sin errores.
- Pantalla `/miembro/membresia` revisada a **375 px** y 1280 px.
- Pendiente manual QA-M1: créditos con reservas reales, cuando exista la tabla `reserva` (H5). El cálculo ya está probado en QA-03.
