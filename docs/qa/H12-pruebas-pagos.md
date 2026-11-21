# QA-12.1. Pruebas del pago de membresía, renovación o sesión adicional

**Historia:** H12. Pago de membresía, renovación o sesión adicional
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

Los casos de la API (QA-01 a QA-20) están automatizados en [test/qa-pagos.e2e-spec.ts](../../test/qa-pagos.e2e-spec.ts):

- Crean sus propios miembros (`qa121-…`) y planes (`[QA-12.1]`). Recepción les registra las compras por la API, así los cobros son los reales del Módulo 1. Al terminar se borra todo.
- **Reloj simulado:** solo se simula `Date`, para llegar al día del vencimiento y pagar la renovación (QA-09).
- **Logs:** se captura todo lo que escribe la API (`console.*`, stdout y stderr). Primero se comprueba que la captura funciona con un marcador, y después que la tarjeta no aparece.
- La espera de la pasarela se reduce a 200 ms. Los **2 segundos reales** se verifican en la prueba unitaria y en el navegador.

Los casos del frontend (QA-F1 a QA-F9) se recorrieron en Google Chrome sin interfaz, a 375 px y 1280 px, contra la API, con bases de prueba creadas desde el seed.

## Tarjetas de prueba de la pasarela simulada

| Tarjeta | Resultado |
|---|---|
| 4242 4242 4242 4242 | APROBADO |
| 4000 0000 0000 0002 | RECHAZADO |
| 4000 0000 0000 0119 | ERROR |
| Cualquier otra válida (p. ej. 5555 5555 5555 4444) | RECHAZADO |

## Casos de prueba por criterio de aceptación

### Criterio 1. "Mis pagos" muestra los cobros pendientes con concepto, detalle, monto con IVA y, en renovaciones, la fecha desde la que se puede pagar

| ID | Caso | Verificación | Resultado |
|---|---|---|---|
| QA-01 | Membresía y sesión adicional pendientes | `GET /cobros/mios?estado=PENDIENTE`: concepto, detalle (plan / "Sesión 20/11/2026 10:00 con Carlos Martínez") y monto | ✅ |
| QA-02 | Renovación pendiente | La misma consulta devuelve `habilitadoDesde` = vencimiento de la membresía actual | ✅ |
| QA-F1 | En pantalla | `/miembro/pagos`, pestaña «Pendientes»: concepto, detalle, «$35.50 IVA incluido» y «Pagar» | ✅ |

### Criterio 2. Compras y sesiones se pagan desde que se generan; la renovación, desde el vencimiento (S3)

| ID | Caso | Verificación | Resultado |
|---|---|---|---|
| QA-03 | Compra y sesión adicional | `habilitado: true` y `habilitadoDesde: null` | ✅ |
| QA-04 | Renovación antes del vencimiento | `habilitado: false`; `POST /cobros/:id/pagar` → 409 "No habilitado: podrás pagar desde el dd/mm/aaaa"; **0 intentos** | ✅ |
| QA-F2 | En pantalla | «No habilitado: podrás pagar desde el 24/11/2026» y «Pagar» **deshabilitado**; al pulsarlo no navega | ✅ |

### Criterio 3. Checkout de la pasarela simulada: "Procesando pago…" 2 segundos y resultado según la tarjeta

| ID | Caso | Verificación | Resultado |
|---|---|---|---|
| QA-05 | 0002, 0119 y otra tarjeta válida | 200 con `RECHAZADO`, `ERROR` y `RECHAZADO`, y su mensaje | ✅ |
| QA-06 | 4242 | Aprueba el pago de una membresía y el de una sesión adicional | ✅ |
| QA-F3 | Checkout en pantalla | Modal con titular, número (4-4-4-4), vencimiento (MM/AA), código de seguridad y monto; «Procesando pago…» con el botón deshabilitado | ✅ |
| QA-U1 | Espera de 2 s | Prueba unitaria con reloj falso: a 1999 ms no responde, a 2000 ms sí. Con la API real, cada pago tardó 2,02 s | ✅ |

### Criterio 4. Aprobado: cobro "Pagado", pago registrado y el Módulo 1 activa o renueva la membresía (S3)

| ID | Caso | Verificación | Resultado |
|---|---|---|---|
| QA-07 | Pago registrado | Cobro `PAGADO` con `pagado_en`; intento `APROBADO` con miembro (vía cobro), concepto, monto, fecha, `ultimos4 = 4242` y referencia `PAY-AAAAMMDD-XXXXXX` | ✅ |
| QA-08 | Compra | La membresía queda `PAGADA`, de hoy a hoy + 29 (cobertura de H2) | ✅ |
| QA-09 | **Renovación pagada el día del vencimiento** (reloj simulado) | Habilitada ese día; al pagar, la renovación queda `PAGADA` **desde el día siguiente** al vencimiento (sin huecos) | ✅ |
| QA-F4 | En pantalla | «Pago aprobado», «Ver comprobante»; la lista se actualiza («No tienes pagos pendientes») y el pago aparece en «Pagados» | ✅ |

### Criterio 5. Comprobante con número, transacción, concepto, subtotal, IVA 13 %, total y fecha

| ID | Caso | Verificación | Resultado |
|---|---|---|---|
| QA-10 | Membresía $35.50 y sesión $12.50 | `GET /comprobantes/:numero`: número con formato `CMP-nnnnnn`, referencia del intento, concepto, **31.42 + 4.08** y **11.06 + 1.44**, `emitidoEn`, `ultimos4` | ✅ |
| QA-11 | Set $50.00 | **44.25 + 5.75** | ✅ |
| QA-U2 | Redondeo half-up | Prueba unitaria: tres montos y ~140.000 montos de $0.01 a $10,000 comparados con un cálculo independiente: 0 diferencias | ✅ |
| QA-F5 | En pantalla | `/miembro/comprobantes/CMP-000001` con todos los datos y «Imprimir»; al imprimir solo sale el comprobante | ✅ |

### Criterio 6. Rechazo o error: sigue "Pendiente", no se activa la membresía, no hay comprobante y se puede reintentar

| ID | Caso | Verificación | Resultado |
|---|---|---|---|
| QA-12 | Intentos sucesivos | Con 0002, 0119 y otra tarjeta, el cobro siguió pendiente; el reintento con 4242 lo pagó. Quedaron 4 intentos y **1 comprobante** | ✅ |
| QA-13 | Rechazo | Mensaje de la pasarela; cobro `PENDIENTE`, membresía `PENDIENTE_PAGO`, **0 comprobantes** | ✅ |
| QA-F6 | En pantalla | El mensaje de la pasarela, «El cobro sigue pendiente. No se realizó ningún cargo.» y «Intentar de nuevo» | ✅ |

### Criterio 7. No se guarda el número completo de la tarjeta ni el código de seguridad

| ID | Caso | Verificación | Resultado |
|---|---|---|---|
| QA-14 | Base de datos | Se revisaron **todas las columnas de texto de todas las tablas**: ninguna contiene un número de tarjeta usado ni el CVV | ✅ |
| QA-15 | Intentos | `ultimos4` siempre son 4 dígitos. Además, la base lo impone: `CHAR(4)` + CHECK, y un número completo se rechaza | ✅ |
| QA-20 | **Logs de la API** | Durante todos los pagos de la prueba no aparece la tarjeta ni el CVV. La captura se comprobó con un marcador, y **con una fuga provocada a propósito la prueba falla** | ✅ |
| QA-F7 | Navegador | La tarjeta solo vive en el estado del modal: al cerrar y reabrir los campos están vacíos; `localStorage` y `sessionStorage` sin datos de la tarjeta | ✅ |

### Criterio 8. Se rechazan la renovación no habilitada, el cobro ajeno y el ya pagado, sin registrar el pago

| ID | Caso | Verificación | Resultado |
|---|---|---|---|
| (QA-04) | Renovación no habilitada | 409 y 0 intentos | ✅ |
| QA-17 | Cobro de otro miembro | 403 y 0 intentos | ✅ |
| QA-18 | Cobro ya pagado | 409 y ningún intento nuevo | ✅ |
| QA-19 | **10 intentos simultáneos** | 1 aprobado y 9 × 409; 1 intento, 1 comprobante y la membresía pagada una vez | ✅ |
| QA-F8 | Doble envío en pantalla | 3 clics rápidos en «Pagar» → un solo intento aprobado | ✅ |
| QA-F9 | Otros roles y comprobante ajeno | Recepción y admin en `/miembro/pagos` → "403 · Acceso denegado"; otro miembro en el comprobante → "No tienes permiso para ver este comprobante." | ✅ |

### Pendiente manual

| ID | Caso | Estado |
|---|---|---|
| QA-M1 | Pagar una **sesión adicional real** agendada con un entrenador (H9) y que el Módulo 3 reciba la confirmación | ⏳ Pendiente de H9. El lado del Módulo 5 (cobro `SESION_ADICIONAL`, listado, pago con 4242 y comprobante) está verificado en QA-01, QA-03, QA-06 y QA-10. H9 debe registrar su confirmación con `CobrosService.registrarConfirmacion('SESION', …)` |

## Pruebas realizadas en cada actividad de H12

### Actividad 1. Migración (cobro ampliado, intento_pago y comprobante)

**Cómo:** se aplicaron todas las migraciones en una base vacía nueva con el seed, se insertó en SQL, se revirtió con `down.sql` y se volvió a aplicar sobre datos de H2.

| Caso | Resultado |
|---|---|
| Se agregan los valores `SESION_ADICIONAL`, `SESION` y `PAGADO`, las columnas `detalle`, `habilitado_desde` y `pagado_en`, las tablas nuevas y la secuencia `comprobante_numero_seq` | ✅ |
| 4 casos válidos y **16 inválidos rechazados**: número completo en `ultimos4`, referencia mal formada o repetida, total ≠ subtotal + IVA, segundo comprobante, `PAGADO` sin fecha, sesión con referencia de membresía, borrar un cobro con pagos… | ✅ |
| `down.sql` revierte, y **se niega sin dejar nada a medias** si hay datos que se perderían | ✅ |
| Al re-aplicar sobre cobros de H2 completa `detalle` y `habilitado_desde` | ✅ |

### Actividad 2. Generación de cobros y GET /cobros/mios

- **Pruebas unitarias de `crearCobro`:** compra, sesión, renovación con y sin fecha, detalle y monto inválidos, y error que deshace la transacción. También de `habilitado` (UTC-6), del listado, del DTO y de los roles.
- **HTTP contra la base real:** compra habilitada, renovación no habilitada, sin cobros, filtros, 400, 403 y 401, **0 cobros compartidos entre miembros**, y una renovación registrada desde recepción que queda bloqueada hasta el vencimiento.

### Actividad 3. Pasarela simulada y POST /cobros/:id/pagar

- **Pruebas unitarias de las cuatro reglas de tarjeta**, Luhn, vencimiento, referencia, espera de 2 s, servicio de pago y DTO.
- **e2e:** aprobado, rechazado y error, 10 intentos simultáneos, 403, 404, 409, 400 y 401.
- **Logs con la API real:** 0 apariciones del número y del CVV en 65 líneas de log.

### Actividad 4. Comprobantes y correlativo

- **IVA con tres montos** y redondeo half-up exacto, verificado contra un cálculo independiente.
- **GET /comprobantes/:numero:** el dueño, el admin, ajeno (403), inexistente (404) y 401.
- **Correlativo sin huecos:** pagos simultáneos dan números consecutivos, y una confirmación que falla **no consume número**. La prueba **detecta el hueco** si se vuelve al orden anterior.

### Actividad 5. Pantalla "Mis pagos" (frontend)

| Caso | Resultado |
|---|---|
| Pestañas «Pendientes» y «Pagados»: cada una consulta `GET /cobros/mios?estado=…` | ✅ |
| Renovación no habilitada: mensaje y botón deshabilitado sin enlace | ✅ |
| Pagados: monto, «Pagado el dd/mm/aaaa» y «Ver comprobante» | ✅ |
| Vacío: «No tienes pagos pendientes» | ✅ |
| Error con «Reintentar» (se hizo fallar la consulta y se restauró) | ✅ |
| 375 px sin desborde; 1280 px | ✅ |

### Actividad 6. Checkout y comprobante (frontend)

| Caso | Resultado |
|---|---|
| Formato 4-4-4-4 y MM/AA; validación igual que el backend (0 intentos con datos inválidos) | ✅ |
| Cerrar y reabrir → campos vacíos; sin datos en `localStorage` ni `sessionStorage` | ✅ |
| «Procesando pago…» con el botón deshabilitado; 3 clics → 1 intento | ✅ |
| 0002 / 0119 → mensaje + «Intentar de nuevo»; 4242 → «Pago aprobado» + «Ver comprobante» | ✅ |
| Comprobante con todos los datos; al imprimir solo sale el comprobante | ✅ |

**Cómo se ve a 375 px:**
- **"Mis pagos":** el título y la línea de ayuda, y dos pestañas («Pendientes» / «Pagados»), con la elegida subrayada en negro.
  - Cada cobro pendiente es una tarjeta con borde gris claro: el concepto, el detalle en gris, el monto en grande con "IVA incluido" y el botón negro «Pagar» a todo el ancho.
  - En una renovación no habilitada se agrega la línea «No habilitado: podrás pagar desde el …», y el botón aparece gris y deshabilitado.
  - En «Pagados», cada tarjeta lleva el concepto, "$monto · Pagado el dd/mm/aaaa" y el enlace subrayado «Ver comprobante».
- **El checkout:** sube desde abajo, sobre el fondo oscurecido.
  - Arriba, en un recuadro gris claro, va el concepto, el detalle y el "Monto a pagar" en grande.
  - Siguen los campos titular, número de tarjeta (con espacios cada 4 dígitos), vencimiento y código de seguridad (oculto), y los botones a todo el ancho.
  - Al aprobarse: «Pago aprobado» en verde, el número de comprobante y de transacción, «Ver comprobante» (negro) y «Cerrar».
  - Al rechazarse: el mensaje en rojo y «Intentar de nuevo».
- **El comprobante:**
  - Arriba, «← Mis pagos» a la izquierda y el botón negro «Imprimir» a la derecha.
  - Debajo, una tarjeta con "Madlions · Comprobante de pago", el número `CMP-000001` en letra monoespaciada y la fecha y hora a la derecha.
  - Luego los datos (miembro, transacción, concepto, detalle y "•••• 4242") y, abajo a la derecha, Subtotal, IVA (13 %) y Total en negrita.
  - Al imprimir desaparecen el menú, el encabezado y los botones.

**A 1280 px:** igual, con el menú lateral a la izquierda («Mis pagos» resaltado). El checkout es una ventana centrada y el comprobante muestra sus datos en dos columnas.

## Resumen

| Criterio | Casos | Resultado |
|---|---|---|
| 1. Cobros pendientes con detalle y monto | QA-01, QA-02, QA-F1 | ✅ |
| 2. Habilitación (renovación desde el vencimiento) | QA-03, QA-04, QA-F2 | ✅ |
| 3. Checkout y reglas de la pasarela | QA-05, QA-06, QA-F3, QA-U1 | ✅ |
| 4. Pagado, registrado y membresía activada/renovada | QA-07 a QA-09, QA-F4 | ✅ |
| 5. Comprobante y cálculos | QA-10, QA-11, QA-U2, QA-F5 | ✅ |
| 6. Rechazo o error | QA-12, QA-13, QA-F6 | ✅ |
| 7. Sin número completo ni CVV (base y logs) | QA-14, QA-15, QA-20, QA-F7 | ✅ |
| 8. Rechazos y pagos duplicados | QA-04, QA-17 a QA-19, QA-F8, QA-F9 | ✅ |

- `npm run test:e2e`: **158/158** (23 de QA-12.1), estable en 2 corridas.
- `npm test`: **402/402**.
- `npm run lint` y `npm run build`: sin errores.
- Pantallas `/miembro/pagos` y `/miembro/comprobantes/:numero` revisadas a **375 px** y 1280 px.
- Pendiente manual QA-M1: pago de una sesión real cuando exista H9.
