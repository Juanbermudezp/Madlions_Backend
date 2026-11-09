# QA-4.1. Pruebas de la programación de clases grupales

**Historia:** H4. Programación de clases grupales
**Responsable:** David Alejandro Sandoval Quijano
**Fecha de ejecución:** 08/11/2026
**Entorno:** API local (`npm run start:dev`, puerto 3000), PostgreSQL 18 del docker-compose, datos de `npm run db:seed`.
**Herramienta:** peticiones HTTP desde PowerShell (`Invoke-WebRequest`) y pruebas unitarias con Vitest (`npm test`).

## Datos de prueba

| Dato | Valor |
|---|---|
| Administrador | admin@madlions.com / `Demo1234!` |
| Entrenador | entrenador@madlions.com (Carlos Martínez) / `Demo1234!` |
| Recepción | recepcion@madlions.com / `Demo1234!` |
| Miembro | miembro@madlions.com / `Demo1234!` |
| Clases del seed (semana del 09/11/2026) | Spinning lun 07:00-08:00, Crossfit lun 10:00-11:00 (cancelada), Yoga mar 18:00-19:00, todas con Carlos |

Las horas se envían y se leen en hora de El Salvador (UTC-6); la API las guarda y las devuelve en UTC.

## Casos de prueba por criterio de aceptación

### Criterio 1. Catálogo de tipos de clase

| ID | Caso | Petición | Esperado | Resultado |
|---|---|---|---|---|
| QA-01 | Crear un tipo nuevo | `POST /tipos-clase` (admin) `{ nombre: "Pilates", descripcion: "Control y fuerza del core." }` | 201 | ✅ 201 con id, nombre y descripción |
| QA-02 | Nombre repetido sin importar mayúsculas | `POST /tipos-clase` (admin) `{ nombre: "pilates" }` | 409 | ✅ 409 "Ya existe un tipo de clase con ese nombre" |
| QA-03 | Nombre de 1 carácter | `POST /tipos-clase` (admin) `{ nombre: "P" }` | 400 | ✅ 400 "El nombre debe tener entre 2 y 40 caracteres." |
| QA-04 | Cualquier rol consulta el catálogo | `GET /tipos-clase` (miembro) | 200 | ✅ 200 |

### Criterios 2 y 3. Registrar una clase y verla en la agenda semanal

| ID | Caso | Petición | Esperado | Resultado |
|---|---|---|---|---|
| QA-05 | Agenda de la semana | `GET /clases?semana=2026-11-09` (admin) | 200 con tipo, entrenador, horario, cupo, reservas, lugares y estado, ordenadas por inicio | ✅ 200: Spinning, Crossfit (`CANCELADA_GIMNASIO`) y Yoga |
| QA-06 | Registrar una clase | `POST /clases` (admin) Spinning, Carlos, 09/11 08:00-09:00, cupo 15 | 201 en estado `PROGRAMADA` | ✅ 201 `PROGRAMADA`, inicio `14:00Z` (08:00 local), 15 lugares |
| QA-07 | La clase nueva aparece en la agenda | `GET /clases/mias?semana=2026-11-09` (Carlos) | La clase de QA-06 en la lista | ✅ Aparece entre Spinning 07:00 y Yoga |
| QA-08 | El entrenador consulta la agenda | `GET /clases?semana=2026-11-09` (entrenador) | 200 | ✅ 200 |

### Criterio 4. Modificar una clase futura

| ID | Caso | Petición | Esperado | Resultado |
|---|---|---|---|---|
| QA-09 | Cambiar solo el cupo | `PATCH /clases/{QA-06}` (admin) `{ cupoMaximo: 25 }` | 200, mismas fechas y horas | ✅ 200, cupo 25, inicio y fin sin cambios |
| QA-10 | Cupo menor que las reservas confirmadas | Prueba unitaria `clases.service.spec.ts` | 409 | ✅ Pasa (8 reservas, cupo 7 → 409; cupo 8 → 200) |

> QA-10 se verifica con prueba unitaria porque las reservas llegan con H5. El conteo está aislado en `ClaseRepository.contarReservasConfirmadas`; mientras no exista la tabla `reserva`, toda clase tiene 0 reservas.

### Criterio 5. Validaciones de los datos

| ID | Caso | Petición | Esperado | Resultado |
|---|---|---|---|---|
| QA-11 | Falta el cupo | `POST /clases` sin `cupoMaximo` | 400 con un solo mensaje | ✅ 400 "El cupo máximo debe ser un número entero de 1 a 50." (un solo mensaje) |
| QA-12 | Cupo 51 | `PATCH /clases/{QA-06}` `{ cupoMaximo: 51 }` | 400 | ✅ 400 (mismo mensaje) |
| QA-13 | Fin igual al inicio | `POST /clases` 08:00-08:00 | 400 | ✅ 400 "La hora de fin debe ser posterior a la de inicio." |
| QA-14 | Fecha pasada | `POST /clases` con fecha 01/11/2026 | 400 | ✅ 400 "La fecha y hora de inicio ya pasaron." |
| QA-15 | El entrenador elegido no es entrenador | `POST /clases` con el id del administrador | 400 | ✅ 400 "El entrenador no existe o no tiene rol de entrenador." |
| QA-16 | Tipo de clase inexistente | `POST /clases` con un UUID que no existe | 400 | ✅ 400 "El tipo de clase no existe o está inactivo." |

### Criterio 6. Traslape con otras actividades del entrenador

| ID | Caso | Petición | Esperado | Resultado |
|---|---|---|---|---|
| QA-17 | Choca con otra clase | `POST /clases` Carlos 09/11 07:30-08:30 (Spinning es 07:00-08:00) | 409 | ✅ 409 "El entrenador ya tiene una actividad en ese horario" |
| QA-18 | Bordes que solo se tocan | `POST /clases` Carlos 09/11 08:00-09:00 | 201 | ✅ 201 (es QA-06) |
| QA-19 | Choca con un bloque de disponibilidad (H8) | Carlos crea el bloque 12/11 10:00-11:00 (`POST /bloques`, 201); admin crea clase 12/11 10:30-11:30 | 409 | ✅ 409 "El entrenador ya tiene una actividad en ese horario" |

> El traslape con sesiones personales se agrega cuando exista la tabla de H9 (DB-9.1).

### Criterio 7. Clases canceladas, iniciadas o terminadas

| ID | Caso | Petición | Esperado | Resultado |
|---|---|---|---|---|
| QA-20 | Modificar una clase cancelada | `PATCH /clases/{Crossfit}` `{ cupoMaximo: 10 }` | 409 | ✅ 409 "No se puede modificar una clase cancelada" |
| QA-21 | Modificar una clase que ya empezó | Prueba unitaria `clases.service.spec.ts` | 409 | ✅ Pasa ("No se puede modificar una clase que ya empezó o terminó") |
| QA-22 | La clase se cancela mientras se edita | Prueba unitaria `clases.service.spec.ts` (la actualización se condiciona a `PROGRAMADA` y sin empezar) | 409 | ✅ Pasa |
| QA-23 | Clase inexistente | `PATCH /clases/00000000-0000-4000-8000-000000000000` | 404 | ✅ 404 "La clase no existe." |

### Criterio 8. Permisos

| ID | Caso | Petición | Esperado | Resultado |
|---|---|---|---|---|
| QA-24 | Entrenador crea una clase | `POST /clases` (entrenador) | 403 | ✅ 403 |
| QA-25 | Recepción modifica una clase | `PATCH /clases/{QA-06}` (recepción) | 403 | ✅ 403 |
| QA-26 | Miembro crea una clase | `POST /clases` (miembro) | 403 | ✅ 403 |
| QA-27 | Entrenador crea un tipo de clase | `POST /tipos-clase` (entrenador) | 403 | ✅ 403 |

### Regresión de H8

| ID | Caso | Petición | Esperado | Resultado |
|---|---|---|---|---|
| QA-28 | `GET /clases/mias` sigue devolviendo `nombre` | `GET /clases/mias?semana=2026-11-09` (Carlos) | 200 con `id, nombre, inicio, fin` | ✅ 200, `nombre` sale del tipo de clase |

## Restricciones de la base de datos (DB-4.1)

Ejecutar en `docker compose exec postgres psql -U postgres -d si_be_boilerplate`. Cada consulta debe fallar.

```sql
-- 1. Cupo fuera de 1 a 50
UPDATE clase SET cupo_maximo = 0 WHERE id = (SELECT id FROM clase LIMIT 1);
-- 2. Fin igual al inicio
UPDATE clase SET fin = inicio WHERE id = (SELECT id FROM clase LIMIT 1);
-- 3. Tipo de clase repetido
INSERT INTO tipo_clase (id, nombre, descripcion) VALUES (gen_random_uuid(), 'Yoga', 'x');
-- 4. Borrar un tipo que tiene clases
DELETE FROM tipo_clase WHERE nombre = 'Spinning';
```

| ID | Caso | Esperado | Resultado |
|---|---|---|---|
| QA-29 | SQL 1 | Error `clase_cupo_maximo_check` | ✅ Error `clase_cupo_maximo_check` |
| QA-30 | SQL 2 | Error `clase_horario_check` | ✅ Error `clase_horario_check` |
| QA-31 | SQL 3 | Error `tipo_clase_nombre_key` | ✅ Error `tipo_clase_nombre_key` |
| QA-32 | SQL 4 | Error `clase_tipo_clase_id_fkey` | ✅ Error `clase_tipo_clase_id_fkey` |

## Pruebas unitarias

`npm test`: **17 archivos, 120 pruebas, todas pasan.** Las de H4:

| Archivo | Qué cubre |
|---|---|
| `src/clases/dto/tipo-clase.dto.spec.ts` | Largo del nombre (2 a 40), descripción obligatoria (hasta 300), espacios, campos de más |
| `src/clases/dto/clase.dto.spec.ts` | Cupo de 1 a 50 con un solo mensaje, UUID, campos de más |
| `src/clases/services/tipos-clase.service.spec.ts` | Crear, editar, nombre duplicado sin importar mayúsculas, 404 |
| `src/clases/services/reglas-clase.spec.ts` | Fecha válida, formato de hora, fin posterior al inicio, horario pasado, estado "Impartida" |
| `src/clases/services/clases.service.spec.ts` | Agenda semanal, crear, modificar, traslape, cupo contra reservas, clase cancelada o iniciada, 404 |

## Pendientes que dependen de otras historias

- **Reservas confirmadas (H5):** cuando exista la tabla `reserva`, `contarReservasConfirmadas` debe contar las reservas `CONFIRMADA` y QA-10 se prueba también de punta a punta.
- **Sesiones personales (H9):** agregar la tabla `sesion_personal` a la validación de traslape de `ClaseRepository`.
