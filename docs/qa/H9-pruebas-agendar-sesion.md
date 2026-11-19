# QA-9.1. Pruebas del agendamiento de sesiones

**Historia:** H9. Agendar sesión con un entrenador
**Responsable:** Juan Bermudez
**Fecha de ejecución:** 17/11/2026
**Entorno:** API local (puerto 8000), frontend local (puerto 3000), PostgreSQL 18 del docker-compose, datos de `npm run db:seed`.

## Pruebas automáticas

`npm run test:e2e -- sesiones` ejecuta `test/qa-sesiones.e2e-spec.ts` y `test/sesiones.e2e-spec.ts` contra la base real. Cada prueba crea sus propios datos y los borra al terminar.

| ID | Criterio | Caso | Esperado | Resultado |
|---|---|---|---|---|
| QA-01 | C1 | Lista de entrenadores y bloques: uno a 2 días (visible), uno a 1 h 59 min, uno a 15 días y uno OCUPADO | Solo aparece el visible, con el precio de la clase puntual | ✓ |
| QA-02 | C2, C3, C4 | Agendamiento exitoso | 201; sesión AGENDADA; bloque OCUPADO; aparece en Mis sesiones; cobro PENDIENTE "Sesión adicional" por el precio vigente | ✓  |
| QA-03 | C5 | Bloque a 1 h 59 min | 409 "Solo puedes agendar con al menos 2 horas de anticipación"; el bloque sigue DISPONIBLE | ✓ |
| QA-04 | C5 | Bloque a 2 h 05 min | 201 | ✓ |
| QA-05 | C6 | Sexta sesión pendiente | 409 con el motivo; quedan 5 sesiones y 5 cobros; el bloque sigue DISPONIBLE | ✓  |
| QA-06 | C6 | Traslape con otra sesión | 409 "Ya tienes otra sesión agendada en ese horario"; el bloque sigue DISPONIBLE |✓  |
| QA-07 | C6 | Traslape con una clase reservada (H5) | 409 "Ya tienes una clase reservada en ese horario"; el bloque sigue DISPONIBLE |✓  |
| QA-08 | C7 | 10 miembros confirman el mismo bloque a la vez | Exactamente 1 respuesta 201 y 9 respuestas 409 "Este horario ya no está disponible"; 1 sesión y 1 cobro | ✓ |
| QA-09 | C8 | Membresía vencida | 409 "Necesitas una membresía vigente para agendar" |✓  |
| QA-10 | C8 | Membresía que vence antes de la sesión | 409 "Necesitas una membresía vigente para agendar" | ✓ |
| QA-11 | C8 | Sin membresía | 409 "Necesitas una membresía vigente para agendar" | ✓ |
| QA-12 | C8 | Próxima a vencer que cubre la fecha | 201 |✓  |
| QA-13 | C4 | Cambio del precio de la clase puntual después de agendar | La sesión y el cobro conservan el precio anterior |✓  |
| QA-14 | C9 | Intentar cancelar (`DELETE /sesiones/:id`) | 404 y la sesión sigue | ✓ |
| QA-15 | Permisos | Entrenador y petición sin token | 403 y 401 |✓  |

## Pruebas manuales del frontend

| ID | Criterio | Pasos | Esperado | Resultado |
|---|---|---|---|---|
| QA-16 | C1 | Miembro vigente, "Agendar sesión", elegir entrenador | Bloques agrupados por día con hora y duración |✓  |
| QA-17 | C1 | Elegir un entrenador sin bloques | "Este entrenador no tiene horarios disponibles en los próximos 14 días" |✓  |
| QA-18 | C2 | Elegir un bloque | Resumen con entrenador, fecha, hora, duración, precio y el aviso del cobro | ✓ |
| QA-19 | C3 | Confirmar | Botón desactivado mientras se envía; "Sesión agendada"; el bloque desaparece de la lista | ✓ |
| QA-20 | C3, C4 | Abrir Mis sesiones | La sesión aparece en Próximas con "Pendiente" y enlace a Mis pagos |✓  |
| QA-21 | C7 | Dos navegadores confirman el mismo bloque | El segundo ve "Este horario ya no está disponible" y la lista se recarga |✓  |
| QA-22 | C8 | Miembro con membresía vencida confirma | "Necesitas una membresía vigente para agendar" |✓  |
| QA-23 | C9 | Revisar Mis sesiones | No hay botón de cancelar | ✓ |
| QA-24 | — | Mis sesiones sin sesiones | "No tienes sesiones agendadas" y botón "Agendar sesión" | ✓  |
| QA-25 | — | Ambas pantallas a 375 px | Se ven completas, sin desplazamiento horizontal |✓  |

## Resultado general

<Ej.: 25 de 25 casos pasan. Sin defectos encontrados.>

## Evidencia

Pruebas automáticas (`npm run test:e2e -- sesiones`) y unitarias (`npx vitest run src/sesiones src/entrenadores`):

![Resultado de las pruebas de H9](evidencias/H9-pruebas.png)