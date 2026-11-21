# QA-6.1. Pruebas de la cancelación de mi reserva (Módulo 2)

**Historia:** H6. Cancelación de mi reserva
**Responsable:** David Alejandro Sandoval Quijano
**Fecha de ejecución:** 20/11/2026
**Entorno:** PostgreSQL 18 del docker-compose, migraciones aplicadas y datos de `npm run db:seed`.

## Cómo ejecutarlas

Todo se corre desde la terminal; no hace falta Swagger ni ninguna llamada manual a la API.

**Backend** (los 6 criterios de punta a punta, contra la base real):

```bash
npm run test:e2e -- test/qa-cancelacion-reservas.e2e-spec.ts
```

Los casos QA-01 a QA-12 están automatizados en [test/qa-cancelacion-reservas.e2e-spec.ts](../../test/qa-cancelacion-reservas.e2e-spec.ts). La prueba crea sus propios datos con el prefijo `QA61` / `qa61-` (1 tipo de clase, 2 planes, 6 miembros con su membresía y las clases que necesita) y los borra al terminar. El caso de las 2 horas exactas congela solo `Date` (reloj simulado), como las pruebas de H2 y H12.

**Frontend** (lo que el miembro ve en "Mis reservas"):

```bash
npm test -- tests/reservas.test.tsx
```

Los casos QA-F1 a QA-F6 están en el bloque "FE-6.1 Cancelación desde Mis reservas" de `tests/reservas.test.tsx` del repositorio del frontend.

## Miembros de prueba (creados por la prueba)

Todas las membresías están pagadas, van de hoy − 5 a hoy + 20 e incluyen Yoga.

| Alias    | Membresía              | Para qué se usa                                                    |
| -------- | ---------------------- | ------------------------------------------------------------------ |
| Mensual  | Mensual                | Cancela, vuelve a reservar y prueba los plazos y los rechazos      |
| Otro     | Mensual                | Dueño de las reservas que Mensual intenta cancelar (criterio 6)    |
| Set      | Set de 2 clases        | Crédito devuelto (criterio 2)                                      |
| Relleno  | 3 miembros con Mensual | Ocupan lugares para medir los lugares disponibles (criterio 1)     |

## Casos de prueba

### Criterio 1 · Con 2 horas o más, la reserva pasa a "Cancelada por el miembro" y los lugares suben en uno

| ID    | Caso                    | Pasos                                                           | Esperado                                                                                         | Resultado |
| ----- | ----------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------- |
| QA-01 | Cancelación a 3 horas   | Clase de cupo 10 con 3 reservas confirmadas; Mensual cancela la suya | 200 `{ id, estado: "CANCELADA_MIEMBRO", lugaresDisponibles: 8 }`; `cancelada_en` guardada; la lista de clases pasa de 7 a 8 lugares | ✅ |
| QA-02 | Mis reservas            | Cancelar y consultar `GET /reservas/mias?estado=proximas`        | La reserva aparece como `CANCELADA_MIEMBRO`                                                      | ✅        |
| QA-03 | 2 horas exactas         | Reloj congelado; clase que empieza justo 2 horas después        | 200: todavía se puede cancelar                                                                   | ✅        |
| QA-F1 | Botón Cancelar          | Render de Próximas con una reserva a 3 horas, otra a 1 h 59 min y otra cancelada | Solo la de 3 horas tiene el botón Cancelar                                  | ✅        |
| QA-F2 | Confirmación            | Clic en Cancelar                                                | Modal "¿Cancelar tu reserva de Yoga del 18/11/2026 a las 07:00?" (hora de El Salvador)           | ✅        |
| QA-F3 | Éxito en pantalla       | Confirmar                                                       | "Reserva cancelada"; la etiqueta pasa a "Cancelada por el miembro" y el botón desaparece, sin recargar la lista | ✅ |
| QA-F4 | Doble envío             | Confirmar mientras la respuesta no llega                        | "Cancelando…" y los botones del modal desactivados                                               | ✅        |
| QA-F6 | Volver                  | Abrir la confirmación y presionar Volver                        | Se cierra sin llamar a la API y la reserva sigue Confirmada                                      | ✅        |

### Criterio 2 · En un Set de clases mensual el crédito vuelve a estar disponible

| ID    | Caso             | Pasos                                                                     | Esperado                                                          | Resultado |
| ----- | ---------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------- |
| QA-04 | Crédito devuelto | Set con sus 2 clases reservadas (0 créditos); cancela una y reserva otra clase | `creditosDisponibles` pasa de 0 a 1; la reserva nueva es 201 y vuelve a 0 | ✅ |

### Criterio 3 · Después de cancelar se puede volver a reservar la misma clase

| ID    | Caso               | Pasos                                         | Esperado                                           | Resultado |
| ----- | ------------------ | --------------------------------------------- | -------------------------------------------------- | --------- |
| QA-05 | Volver a reservar  | Reservar, cancelar y reservar la misma clase  | 201 con una reserva nueva `CONFIRMADA` (otro id)   | ✅        |

### Criterio 4 · Con menos de 2 horas o con la clase iniciada se rechaza

| ID    | Caso                  | Pasos                                   | Esperado                                                                                  | Resultado |
| ----- | --------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------- | --------- |
| QA-06 | 1 hora 59 minutos     | Cancelar una clase que empieza en 1 h 59 min | 409 "Solo puedes cancelar hasta 2 horas antes del inicio de la clase"; la reserva sigue `CONFIRMADA` | ✅ |
| QA-07 | Clase ya iniciada     | Cancelar una clase que empezó hace 30 min | 409 con el mismo mensaje; la reserva sigue `CONFIRMADA`                                  | ✅        |
| QA-F5 | Motivo en pantalla    | El backend rechaza por el plazo          | El mensaje aparece dentro del modal y la lista de Próximas se vuelve a pedir             | ✅        |

### Criterio 5 · Una reserva ya cancelada no se cancela otra vez

| ID    | Caso                         | Pasos                                              | Esperado                                                     | Resultado |
| ----- | ---------------------------- | -------------------------------------------------- | ------------------------------------------------------------ | --------- |
| QA-08 | Doble cancelación            | Cancelar dos veces la misma reserva                | La segunda: 409 "Esta reserva ya fue cancelada"              | ✅        |
| QA-09 | Cancelada por el gimnasio    | Cancelar una reserva `CANCELADA_GIMNASIO`          | 409 "Esta reserva ya fue cancelada"; no cambia               | ✅        |
| QA-10 | Cancelaciones simultáneas    | 5 peticiones a la vez sobre la misma reserva       | Una sola 200; las otras 4 responden 409 "Esta reserva ya fue cancelada" | ✅ |

### Criterio 6 · La reserva de otro miembro no se puede cancelar

| ID    | Caso                            | Pasos                                                  | Esperado                                | Resultado |
| ----- | ------------------------------- | ------------------------------------------------------ | --------------------------------------- | --------- |
| QA-11 | Reserva ajena                   | Mensual cancela una reserva de Otro                    | 403; la reserva sigue `CONFIRMADA`      | ✅        |
| QA-12 | Errores de la petición y acceso | Reserva inexistente, id inválido, administrador, sin sesión | 404, 400, 403 y 401; la reserva no cambia | ✅    |

## Resultado

| Ejecución                                                        | Resultado                    |
| ---------------------------------------------------------------- | ---------------------------- |
| `npm run test:e2e -- test/qa-cancelacion-reservas.e2e-spec.ts`  | ✅ 12 de 12 (corrida 3 veces seguidas) |
| `npm run test:e2e` (toda la suite)                               | ✅ 350 de 350 (19 archivos)  |
| Backend `npm test` (pruebas unitarias)                           | ✅ 787 de 787 (76 archivos)  |
| Frontend `npm test -- tests/reservas.test.tsx`                   | ✅ 20 de 20                  |
| Frontend `npm test` (toda la suite)                              | ✅ 252 de 252 (18 archivos)  |
## Pruebas relacionadas

| Archivo                                          | Qué cubre                                                                                     |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `src/reservas/services/reglas-reserva.spec.ts`   | Límite de 2 horas: 3 h, 2 h exactas, 1 h 59 min, 1 ms menos, iniciada; reserva ya cancelada (definición de terminado de BE-6.1) |
| `src/reservas/services/reservas.service.spec.ts` | 404, 403 sin tocar la reserva, 409 por estado y por plazo, lugares devueltos, doble clic      |
| Frontend `tests/reservas.test.tsx`               | `puedeCancelar` en los mismos bordes y el texto de la confirmación                            |
