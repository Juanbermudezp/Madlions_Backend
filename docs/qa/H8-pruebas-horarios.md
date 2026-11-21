# QA-8.1. Pruebas de la definición de horarios disponibles

**Historia:** H8. Definición de horarios disponibles
**Responsable:** <tu nombre completo>
**Fecha de ejecución:** <fecha>
**Entorno:** API local (puerto 8000), frontend local (`/entrenador/horarios`, puerto 3000), PostgreSQL 18 del docker-compose, datos de `npm run db:seed`.

## Datos de prueba (contraseña `Demo1234!`)

| Uso | Correo |
|---|---|
| Entrenador principal (tiene clases) | entrenador@madlions.com |
| Otro entrenador | entrenador2@madlions.com |
| Miembro | miembro@madlions.com |
| Recepción | recepcion@madlions.com |
| Administrador | admin@madlions.com |

Clases del seed para el entrenador principal: **Spinning** mañana 07:00–08:00 (PROGRAMADA), **Yoga** pasado mañana 18:00–19:00 (PROGRAMADA) y **Crossfit** mañana 10:00–11:00 (CANCELADA).

## Casos de prueba

### Criterio 1. Registrar un bloque válido queda "Disponible"

| ID | Caso | Pasos | Esperado | Resultado |
|---|---|---|---|---|
| QA-01 | Bloque de 45 min | Pantalla: clic en un espacio libre, 45 min, Guardar | Bloque verde "Disponible" | |
| QA-02 | Bloque de 60 min | Igual, 60 min | Bloque verde "Disponible" | |
| QA-03 | Bloque de 90 min | Igual, 90 min | Bloque verde "Disponible" | |

### Criterio 2. Aparece sin recargar y se actualiza

| ID | Caso | Pasos | Esperado | Resultado |
|---|---|---|---|---|
| QA-04 | Aparece sin recargar | Guardar un bloque | "Bloque registrado" y el bloque aparece sin recargar la página | |
| QA-05 | Botón Actualizar | Crear un bloque desde Swagger y presionar Actualizar | El bloque aparece | |
| QA-06 | Refresco cada 30 s | Crear un bloque desde Swagger y esperar sin tocar la pantalla | Aparece en 30 s o menos | |
| QA-07 | Visibilidad para el miembro | `SELECT * FROM bloque_disponibilidad;` | El bloque queda guardado como DISPONIBLE | |

> QA-07: la consulta del miembro pertenece a la historia de agendar sesión, que aún no existe. Se verifica que el bloque queda persistido y disponible para esa consulta.

### Criterio 3. Colores del calendario

| ID | Caso | Pasos | Esperado | Resultado |
|---|---|---|---|---|
| QA-08 | Disponible en verde | Ver la semana actual | Bloques disponibles en verde | |
| QA-09 | Ocupado en azul | Marcar un bloque como ocupado (SQL 1) y presionar Actualizar | Bloque azul "Ocupado" | |
| QA-10 | Clases en gris | Ver mañana | Spinning en gris, sin botón Eliminar | |

> QA-09: el nombre del miembro se muestra cuando exista la historia de agendar sesión; mientras tanto la API devuelve `miembro: null`.

### Criterio 4. Eliminar un bloque disponible

| ID | Caso | Pasos | Esperado | Resultado |
|---|---|---|---|---|
| QA-11 | Eliminar y confirmar | Eliminar, Aceptar | "Bloque eliminado" y desaparece | |
| QA-12 | Eliminar y cancelar | Eliminar, Cancelar | El bloque se queda | |

### Criterio 5. No se elimina un bloque ocupado

| ID | Caso | Pasos | Esperado | Resultado |
|---|---|---|---|---|
| QA-13 | Eliminar ocupado | Swagger: `DELETE /bloques/{id}` del bloque de QA-09 | 409 "No puedes eliminar un bloque con una sesión agendada" | |

### Criterio 6. Traslapes

| ID | Caso | Pasos | Esperado | Resultado |
|---|---|---|---|---|
| QA-14 | Traslape con otro bloque | Bloque de 60 min que empiece a la mitad de uno existente | "Ya tienes una actividad en ese horario" | |
| QA-15 | Traslape con clase programada | Bloque mañana a las 07:00 (choca con Spinning) | "Ya tienes una actividad en ese horario" | |
| QA-16 | Bloques contiguos | Bloque que empieza justo cuando termina otro (p. ej. 08:00 después de 07:00–08:00) | Se guarda | |
| QA-17 | Clase cancelada no bloquea | Bloque mañana a las 10:00 (Crossfit cancelada) | Se guarda | |

### Criterio 7. Datos inválidos

| ID | Caso | Pasos | Esperado | Resultado |
|---|---|---|---|---|
| QA-18 | Duración 30 | Swagger: `POST /bloques` con `duracionMin: 30` | 400 "La duración debe ser de 45, 60 o 90 minutos." | |
| QA-19 | Fecha a 29 días | Formulario con una fecha a 29 días | "La fecha debe estar dentro de los próximos 28 días." | |
| QA-20 | Fecha pasada | Formulario con la fecha de ayer | "La fecha ya pasó." | |
| QA-21 | Hora fuera de horario | Formulario con 04:45 y con 21:15 | "La hora de inicio debe estar entre 5:00 y 21:00, en múltiplos de 15 minutos." | |
| QA-22 | Hora no múltiplo de 15 | Formulario con 10:10 | Mismo mensaje de QA-21 | |

### Criterio 8. Permisos

| ID | Caso | Pasos | Esperado | Resultado |
|---|---|---|---|---|
| QA-23 | Eliminar bloque de otro entrenador | Login con entrenador2, `DELETE /bloques/{id}` de un bloque de entrenador | 403 | |
| QA-24 | Miembro | Login con miembro, `POST /bloques` y `DELETE /bloques/{id}` | 403 en ambos | |
| QA-25 | Recepción | Igual con recepción | 403 en ambos | |
| QA-26 | Administrador | Igual con admin | 403 en ambos | |
| QA-27 | Sin token | `POST /bloques` sin Authorize | 401 | |
| QA-28 | Pantalla para otros roles | Login con miembro y abrir `/entrenador/horarios` | Redirige al inicio | |

### Diseño adaptable

| ID | Caso | Pasos | Esperado | Resultado |
|---|---|---|---|---|
| QA-29 | Vista en 375 px | DevTools, modo dispositivo, ancho 375 | Calendario como lista por día | |

Consulta de apoyo (`docker compose exec postgres psql -U postgres -d si_be_boilerplate`):

```sql
-- 1. Marca como OCUPADO el último bloque creado (simula una sesión agendada)
UPDATE bloque_disponibilidad SET estado = 'OCUPADO'
WHERE id = (SELECT id FROM bloque_disponibilidad ORDER BY creado_en DESC LIMIT 1);
```

## Resultado general

<Ej.: 29 de 29 casos pasan. Sin defectos encontrados.>

## Evidencia

Pruebas unitarias (`npm test`): <N> pruebas, todas pasan.

![Resultado de npm test](![alt text](image.png))