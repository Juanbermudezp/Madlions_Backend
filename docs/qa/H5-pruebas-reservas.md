# QA-5.1. Pruebas de la reserva de cupos (Módulo 2)

**Historia:** H5. Reserva de un cupo
**Responsable:** David Alejandro Sandoval Quijano
**Fecha de ejecución:** 18/11/2026
**Entorno:** PostgreSQL 18 del docker-compose, migraciones aplicadas y datos de `npm run db:seed`.

## Cómo ejecutarlas

Todo se corre desde la terminal; no hace falta Swagger ni ninguna llamada manual a la API.

**Backend** (criterios 1 a 9 de punta a punta, contra la base real):

```bash
npm run test:e2e -- test/qa-reservas.e2e-spec.ts
```

Los casos QA-01 a QA-21 están automatizados en [test/qa-reservas.e2e-spec.ts](../../test/qa-reservas.e2e-spec.ts). La prueba crea sus propios datos con el prefijo `QA-5.1` / `qa51-` (2 tipos de clase, 2 planes, 14 miembros con su membresía y las clases que necesita) y los borra al terminar.

**Frontend** (lo que el miembro ve en pantalla en los criterios 1 a 4):

```bash
npm test -- tests/reservas.test.tsx
```

Los casos QA-F1 a QA-F6 están en `tests/reservas.test.tsx` del repositorio del frontend.

## Miembros de prueba (creados por la prueba)

| Alias    | Membresía                                          | Estado             |
| -------- | -------------------------------------------------- | ------------------ |
| Mensual  | Mensual, incluye Yoga, vence en 20 días            | `VIGENTE`          |
| Próxima  | Mensual, incluye Yoga, vence en 2 días             | `PROXIMA_A_VENCER` |
| Set      | Set de 2 clases, incluye Yoga, vence en 26 días    | `VIGENTE`          |
| Vencida  | Mensual, venció ayer                               | `VENCIDA`          |
| Fila 1-10 | 10 miembros con Mensual vigente (concurrencia)    | `VIGENTE`          |

Ningún plan incluye el tipo de clase "Box", que se usa para el caso del tipo no incluido.

## Casos de prueba

### Criterio 1 · Clases de la semana: programadas, futuras, ordenadas y con la semana siguiente

| ID    | Caso                     | Pasos                                                                                | Esperado                                                                                                  | Resultado |
| ----- | ------------------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | --------- |
| QA-01 | Lista de la semana       | Dos clases futuras (en desorden), una cancelada y una ya iniciada; `GET /clases/reservables` | 200; no aparecen la cancelada ni la iniciada; las futuras por hora con tipo, entrenador, horario y lugares | ✅        |
| QA-02 | Semana siguiente         | `semana` = hoy + 7 y hoy + 21                                                        | 200 la siguiente; 400 "Solo puedes consultar las clases de esta semana o de la siguiente." la otra        | ✅        |
| QA-F1 | Pantalla agrupada por día | Render de Clases de la semana con 3 clases de 2 días                                 | Clases agrupadas por día (hora de El Salvador) con lugares y etiquetas Reservada y Llena                  | ✅        |
| QA-F2 | Pestaña Semana siguiente | Clic en "Semana siguiente"                                                           | Se consulta esa semana y se muestran sus clases                                                           | ✅        |

### Criterio 2 · Semana sin clases

| ID    | Caso               | Pasos                                                                      | Esperado                                                  | Resultado |
| ----- | ------------------ | -------------------------------------------------------------------------- | --------------------------------------------------------- | --------- |
| QA-03 | Semana vacía (API) | Se apartan temporalmente las clases de la semana siguiente y se consulta   | 200 con `[]` (las clases se restauran al terminar)        | ✅        |
| QA-F3 | Mensaje en pantalla | Render con la lista vacía                                                 | "No hay clases programadas para esta semana"              | ✅        |

### Criterio 3 · Detalle antes de confirmar

| ID    | Caso               | Pasos                                       | Esperado                                                     | Resultado |
| ----- | ------------------ | ------------------------------------------- | ------------------------------------------------------------ | --------- |
| QA-04 | Datos del detalle  | Clase con cupo 7; consultar la lista        | Trae tipo, entrenador, inicio y fin, y 7 lugares disponibles | ✅        |
| QA-F4 | Modal de detalle   | Clic en una clase                           | El modal muestra entrenador, fecha, horario y lugares, con el botón Reservar | ✅ |

### Criterio 4 · Reserva confirmada con membresía Vigente o Próxima a vencer

| ID    | Caso                    | Pasos                                          | Esperado                                                                                              | Resultado |
| ----- | ----------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------- |
| QA-05 | Mensual vigente         | Mensual reserva una clase con cupo 5           | 201 `CONFIRMADA` con `lugaresDisponibles: 4`; `creada_en` registrado; aparece en `GET /reservas/mias`; la lista muestra 4 lugares y `yaReservada` | ✅ |
| QA-06 | Próxima a vencer        | Próxima reserva una clase de mañana            | 201                                                                                                   | ✅        |
| QA-F5 | Confirmación en pantalla | Reservar desde el modal                       | "Reserva confirmada"; la tarjeta pasa a Reservada con los lugares nuevos                               | ✅        |

### Criterio 5 · Set de clases: cada reserva compromete un crédito

| ID    | Caso                  | Pasos                                                   | Esperado                                                                 | Resultado |
| ----- | --------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------ | --------- |
| QA-07 | Créditos y sin créditos | Set reserva 2 clases y luego una tercera              | Créditos 2 → 1 → 0 en `GET /membresias/mia`; la tercera: 409 "No te quedan clases disponibles en tu plan" y la clase sigue sin reservas | ✅ |

### Criterio 6 · Reserva duplicada o con traslape

| ID    | Caso                           | Pasos                                                    | Esperado                                         | Resultado |
| ----- | ------------------------------ | -------------------------------------------------------- | ------------------------------------------------ | --------- |
| QA-08 | Misma clase dos veces          | Mensual reserva la misma clase dos veces                 | 2.ª: 409 "Ya reservaste esta clase"; 1 reserva   | ✅        |
| QA-09 | Traslape con otra clase        | Reserva una clase y luego otra que empieza 30 min después | 409 "Tienes otra actividad en ese horario"      | ✅        |
| QA-10 | Bordes que solo se tocan       | Una clase termina cuando empieza la otra                 | Las dos se reservan (no es traslape)             | ✅        |
| QA-M1 | Traslape con sesión personal   | —                                                        | 409 "Tienes otra actividad en ese horario"       | ⏳ Pendiente de H9 |

> QA-M1 queda pendiente: la tabla `sesion_personal` llega con H9 (Juan), que aún no está en develop. Cuando se fusione, se agrega la validación en `ReservaRepository.tieneTraslape()` y este caso a la prueba.

### Criterio 7 · Dos miembros por el último lugar

| ID    | Caso          | Pasos                                                         | Esperado                                                              | Resultado |
| ----- | ------------- | ------------------------------------------------------------- | --------------------------------------------------------------------- | --------- |
| QA-11 | Concurrencia  | Clase con cupo 1; los 10 miembros de la fila reservan a la vez | Exactamente una 201 y nueve 409 "La clase está llena"; 1 reserva en la base | ✅ |

### Criterio 8 · Motivos de rechazo, sin cambiar cupos ni créditos

| ID    | Caso                           | Pasos                                       | Esperado                                                    | Resultado |
| ----- | ------------------------------ | ------------------------------------------- | ----------------------------------------------------------- | --------- |
| QA-12 | Clase cancelada                | Reservar una clase `CANCELADA_GIMNASIO`     | 409 "La clase ya no está disponible"                        | ✅        |
| QA-13 | Clase ya iniciada              | Reservar una clase que empezó hace 15 min   | 409 "La clase ya no está disponible"                        | ✅        |
| QA-14 | Clase llena                    | Cupo 1 ya ocupado                           | 409 "La clase está llena"; sigue con 1 reserva              | ✅        |
| QA-15 | Tipo no incluido               | Reservar una clase de Box                   | 409 "Tu plan no incluye este tipo de clase"                 | ✅        |
| QA-16 | Fuera de la cobertura          | Próxima reserva una clase dentro de 5 días  | 409 "Tu membresía no cubre la fecha de esta clase"          | ✅        |
| QA-17 | Membresía vencida              | Vencida intenta reservar                    | 409 "Necesitas una membresía vigente para reservar"         | ✅        |
| QA-18 | Sin cambios por los rechazos   | Revisar la base después de los rechazos     | Ninguna reserva de Vencida; los créditos de Set siguen en 0 | ✅        |
| QA-19 | Errores de la petición y acceso | Clase inexistente, id inválido, admin, sin sesión | 404, 400, 403 y 401                                    | ✅        |
| QA-F6 | Motivo en pantalla             | Rechazo del backend al reservar             | El motivo aparece dentro del modal; con "La clase está llena" la lista se recarga | ✅ |

> El mensaje de QA-17 no está en la ficha de BE-5.2 (que no define qué responder sin membresía vigente); se tomó el de H9: "Necesitas una membresía vigente para reservar".

### Criterio 9 · Aviso "Reserva confirmada" por el servicio de avisos (H22)

| ID    | Caso                   | Pasos                                       | Esperado                                                                                                          | Resultado |
| ----- | ---------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------- |
| QA-20 | Aviso de confirmación  | Mensual reserva una clase                   | Un solo aviso `NO_LEIDO`, módulo `CLASES`, referencia `reserva-{id}-confirmada`, título "Reserva confirmada: {tipo}" y el mensaje del criterio con fecha y horas de El Salvador | ✅ |
| QA-21 | Rechazo sin aviso      | Reserva rechazada (tipo no incluido)        | No se crea ningún aviso                                                                                           | ✅        |

> La bandeja "Mis avisos" (pantalla y `GET /api/v1/avisos/mios`) es de H23. Mientras no esté, QA-20 revisa el aviso directamente en la base, igual que QA-22.1. Cuando H23 se fusione, se repite con la bandeja.

## Resultado

| Ejecución                                   | Resultado                |
| ------------------------------------------- | ------------------------ |
| `npm run test:e2e -- test/qa-reservas.e2e-spec.ts` | ✅ 21 de 21 (corrida 3 veces seguidas) |
| `npm run test:e2e` (toda la suite)          | ✅ 209 de 209            |
| Frontend `npm test -- tests/reservas.test.tsx` | ✅ 13 de 13           |
| Pendiente                                   | QA-M1 (traslape con sesión personal, depende de H9) |

## Pruebas relacionadas

| Archivo                                         | Qué cubre                                                              |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| `src/reservas/services/reglas-reserva.spec.ts`  | Semanas permitidas, orden de las reglas de rechazo y texto del aviso   |
| `src/reservas/services/reservas.service.spec.ts` | Lista reservable, Mis reservas, transacción, aviso y doble clic       |
| `test/reservas.e2e-spec.ts`                     | Prueba de punta a punta de BE-5.2, incluida la concurrencia (definición de terminado) |
