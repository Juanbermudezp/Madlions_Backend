# QA-21.1. Pruebas del panel de calificaciones

**Historia:** H21. Promedio de calificación por entrenador y por clase
**Responsable:** Gabriel Alejandro Batres Flores
**Fecha de ejecución:** 20/11/2026
**Entorno:** API local (puerto 8000), PostgreSQL 18 del docker-compose, datos de `npm run db:seed`; frontend con `npm run dev` (puerto 3000) y el navegador integrado, a 1024 px.
**Herramientas:** pruebas e2e con Vitest + Supertest (`npm run test:e2e`), pruebas unitarias del backend y del frontend (`npm test`) y recorrido en el navegador.

> H21 no tiene task de base de datos: lee la tabla `resena` que creó DB-20.1.

## Cómo ejecutar

```bash
docker compose up -d postgres
npm run prisma:deploy && npm run db:seed
npm run test:e2e
```

Los casos QA-01 a QA-18 están automatizados en [test/estadisticas.e2e-spec.ts](../../test/estadisticas.e2e-spec.ts). Crean su propio tipo de clase, dos entrenadores y las reseñas con calificaciones conocidas, y al terminar borran todo: el seed queda igual que antes de correrlas.

Para la pantalla, en `Madlions_Frontend`:

```bash
npm run dev
```

## Datos de prueba

| Dato | Valor |
|---|---|
| Administrador | admin@madlions.com / `Demo1234!` |
| Entrenador | entrenador@madlions.com / `Demo1234!` |
| Recepción | recepcion@madlions.com / `Demo1234!` |
| Miembro | estado.vigente@madlions.com / `Demo1234!` |

Las reseñas las crean las pruebas, con calificaciones elegidas para que los promedios se puedan comprobar a mano:

| Reseña | Días atrás | Entrenador | Actividad | Instalaciones |
|---|---|---|---|---|
| 1 | 1 | 5 | 5 | 5 |
| 2 | 2 | 4 | 4 | 4 |
| 3 | 3 | 3 | 3 | 3 |
| 4 | 4 | *(omitida)* | 1 | *(omitida)* |
| 5 | 60 | 1 | 1 | 1 |

Esperado en el rango por defecto (últimos 30 días), que deja fuera la quinta:

- **Entrenador A:** (5 + 4 + 3) / 3 = **4.0** con **3** reseñas. La cuarta omitió al entrenador, así que no baja el promedio ni suma al total.
- **Tipo de clase:** (5 + 4 + 3 + 1) / 4 = 3.25 → **3.3** con **4** reseñas.
- **Instalaciones:** (5 + 4 + 3) / 3 = **4.0** con **3**.
- **Entrenador B:** 2 reseñas → **sin promedio**.

> El panel de instalaciones es global, así que la prueba se niega a correr si encuentra reseñas de otra corrida en la base: con ellas el resultado esperado no cuadraría.

### Datos para revisar la pantalla a mano

Cuatro reseñas (5, 4, 3, 5) por cada entrenador del seed:

```sql
DO $$
DECLARE
  id_miembro uuid := (SELECT m.id FROM miembro m JOIN usuario u ON u.id = m.usuario_id
                      WHERE u.email = 'estado.vigente@madlions.com');
  id_membresia uuid := (SELECT id FROM membresia WHERE miembro_id = id_miembro LIMIT 1);
  id_clase uuid; id_reserva uuid; termino timestamp;
  entrenador record; tipo record; notas int[] := ARRAY[5, 4, 3, 5]; n int; dia int := 0;
BEGIN
  FOR entrenador IN SELECT id FROM usuario WHERE rol = 'ENTRENADOR' LOOP
    SELECT id INTO tipo FROM tipo_clase ORDER BY nombre LIMIT 1;
    FOREACH n IN ARRAY notas LOOP
      dia := dia + 1;
      termino := CURRENT_TIMESTAMP - (dia || ' days')::interval;
      INSERT INTO clase (id, tipo_clase_id, entrenador_id, descripcion, inicio, fin, cupo_maximo)
      VALUES (gen_random_uuid(), tipo.id, entrenador.id, '[DEMO-H21] clase',
        termino - interval '1 hour', termino, 10)
      RETURNING id INTO id_clase;
      INSERT INTO reserva (id, clase_id, miembro_id, membresia_id, asistencia,
        asistencia_registrada_por, asistencia_registrada_en)
      VALUES (gen_random_uuid(), id_clase, id_miembro, id_membresia, 'ASISTIO', entrenador.id, termino)
      RETURNING id INTO id_reserva;
      INSERT INTO resena (id, miembro_id, reserva_id, entrenador_id, tipo_clase_id,
        cal_actividad, cal_entrenador, cal_instalaciones, creada_en)
      VALUES (gen_random_uuid(), id_miembro, id_reserva, entrenador.id, tipo.id, n, n, LEAST(n, 4), termino);
    END LOOP;
  END LOOP;
END $$;
```

Al terminar se borran las reseñas, las reservas y las clases `[DEMO-H21]`.

## Casos de prueba por criterio de aceptación

Los casos `QA-nn` son automáticos (e2e contra la API); los `QA-Fnn` son del recorrido en el navegador.

### Criterio 1. Promedio con un decimal y total por entrenador, por clase y de las instalaciones

| ID | Caso | Petición / acción | Esperado | Resultado |
|---|---|---|---|---|
| QA-01 | Entrenador con 3 calificaciones | `GET /estadisticas/calificaciones` | Promedio 4 y total 3 | ✅ |
| QA-02 | Las calificaciones omitidas no cuentan | Misma respuesta | El entrenador queda en 3; el tipo de clase cuenta 4 | ✅ Criterio técnico |
| QA-03 | Redondeo a un decimal | Tipo de clase con 3.25 | 3.3 | ✅ |
| QA-04 | Instalaciones | Misma respuesta | Promedio 4 y total 3 | ✅ |
| QA-05 | Los entrenadores sin reseñas igual aparecen | Misma respuesta | Promedio null y total 0 | ✅ |
| QA-F1 | Tarjeta de instalaciones | `/admin/calificaciones` | Promedio con estrellas y "8 reseñas en el período" | ✅ |
| QA-F2 | Pestañas Entrenadores y Clases | Misma pantalla | Las dos con su tabla | ✅ |
| QA-F3 | Columnas de la tabla | Misma pantalla | Nombre, Promedio con estrellas, Reseñas | ✅ |

### Criterio 2. Rango de 30 días por defecto, recalculable y ordenable

| ID | Caso | Petición / acción | Esperado | Resultado |
|---|---|---|---|---|
| QA-06 | Sin rango | `GET` sin query | Hoy y los 29 días anteriores | ✅ |
| QA-07 | La reseña de hace 60 días queda fuera | Misma respuesta | El entrenador sigue en 3 reseñas | ✅ |
| QA-08 | Al ampliar el rango entra | `?desde=hoy-90&hasta=hoy` | El promedio baja a 3.3 con 4 reseñas | ✅ |
| QA-09 | Un rango sin reseñas | `?desde=hoy-400&hasta=hoy-300` | Todo en null y total 0 | ✅ |
| QA-10 | El rango devuelto es el pedido | `?desde=2026-11-01&hasta=2026-11-15` | Los mismos días en la respuesta | ✅ |
| QA-F4 | Selector de rango | `/admin/calificaciones` | Desde, Hasta, Aplicar y "Últimos 30 días" (el de FE-26.1) | ✅ |
| QA-F5 | Orden por promedio | Pulsar la cabecera Promedio | Alterna ▼ y ▲ | ✅ |
| QA-F6 | Las filas sin promedio quedan al final | Ordenar en las dos direcciones | "Sin datos suficientes" siempre abajo | ✅ |

### Criterio 3. Con menos de 3 reseñas, "Sin datos suficientes"

| ID | Caso | Petición / acción | Esperado | Resultado |
|---|---|---|---|---|
| QA-11 | Entrenador con 2 calificaciones | `GET` | Promedio null, total 2 | ✅ |
| QA-12 | Con la tercera ya se publica | Agregar una reseña y volver a pedir | Promedio 5, total 3 | ✅ |
| QA-F7 | La etiqueta en la tabla | Pestaña Clases con tipos sin reseñas | "Sin datos suficientes" en lugar del promedio | ✅ Texto exacto |

> El umbral exacto (0, 1, 2 y 3 reseñas) está cubierto por las pruebas unitarias de `promedioPublicable`, que es lo que pide la DoD de BE-21.1.

### Criterio 4. Rango inválido

| ID | Caso | Petición / acción | Esperado | Resultado |
|---|---|---|---|---|
| QA-13 | Inicio posterior al fin | `?desde=2026-11-30&hasta=2026-11-01` | 400 "La fecha de inicio no puede ser posterior a la de fin" | ✅ Mensaje exacto |
| QA-14 | Formato que no es AAAA-MM-DD | `?desde=01/11/2026` | 400 | ✅ |
| QA-15 | Fecha que no existe | `?desde=2026-02-30` | 400 | ✅ |
| QA-16 | Mismo día de inicio y fin | `?desde=hoy&hasta=hoy` | 200 | ✅ |
| QA-F8 | El aviso en la pantalla | Poner Desde después de Hasta y Aplicar | El mensaje en rojo bajo el selector, sin recargar los datos | ✅ |

### Criterio 5. Solo el administrador entra al panel

| ID | Caso | Petición / acción | Esperado | Resultado |
|---|---|---|---|---|
| QA-17 | Miembro, entrenador y recepción | `GET /estadisticas/calificaciones` | 403 en los 3 | ✅ |
| QA-18 | Sin sesión | `GET` sin token | 401 | ✅ |
| QA-F9 | La pantalla con otro rol | `/admin/calificaciones` como entrenador | "403 · Acceso denegado" | ✅ |

## Pruebas realizadas en cada actividad de H21

### Actividad 1. BE-21.1. Estadísticas de calificaciones

**Pruebas unitarias (21), en `src/estadisticas/`:**

| Archivo | Qué cubre |
|---|---|
| `services/reglas-calificaciones.spec.ts` | **El umbral de 3 reseñas, que es lo que pide la DoD:** 0, 1, 2, 3 y más; el redondeo a un decimal (4.25 → 4.3, 4.24 → 4.2, 10/3 → 3.3); y que sin promedio no se inventa uno aunque haya reseñas |
| `services/estadisticas.service.spec.ts` | El rango por defecto de 30 días, la conversión de los días de El Salvador a instantes UTC, el 400 del inicio posterior al fin y el de una fecha inexistente, el rango de un solo día; y que el promedio se publica o se oculta según el total, con los entrenadores sin reseñas incluidos |

**Pruebas e2e:** los 18 casos de arriba, contra la API real.

**Reutilización:** el rango y el redondeo salen de `reglas-reporte.ts` del Módulo 10 (H26), que ya los dejó como funciones puras para que los reportes siguientes los usaran. Así el panel de calificaciones y los reportes tratan las fechas igual y dan el mismo mensaje de error.

### Actividad 2. FE-21.1. Panel de calificaciones

**Pruebas unitarias del frontend (14), en `tests/calificaciones.test.ts` del repositorio `Madlions_Frontend`:** el orden por promedio en las dos direcciones, que las filas sin promedio quedan al final, el desempate por nombre, que no se modifica el arreglo original, el formato con un decimal, las estrellas que se pintan, el texto de las reseñas y la Server Action (ruta, query, token y el rechazo de los otros roles).

**Recorrido en el navegador:** `npm run dev` contra la API local, con el administrador y el entrenador del seed, a 1024 px.

| Caso | Resultado |
|---|---|
| La opción "Calificaciones" del menú queda resaltada | ✅ |
| Estado de carga mientras se recalcula | ✅ Reutiliza el de los reportes |
| El encabezado dice el rango que se está viendo | ✅ "22/10/2026 al 20/11/2026" |
| Los promedios coinciden con los datos de prueba | ✅ 4.3 por entrenador, 3.8 en instalaciones |
| Cambiar de pestaña no vuelve a llamar a la API | ✅ Las dos listas vienen en la misma respuesta |

**Cómo se ve a 1024 px:** el título "Calificaciones" con el rango debajo. Sigue el selector de fechas de los reportes (Desde, Hasta, Aplicar y "Últimos 30 días"). Después, una tarjeta ancha de instalaciones con el rótulo, cuántas reseñas hay en el período y, a la derecha, las cinco estrellas y el promedio en grande. Abajo, una tarjeta con las pestañas Entrenadores y Clases: la activa lleva una línea inferior, y dentro va la tabla con Nombre, Promedio (estrellas más el número, con la cabecera que ordena y muestra ▼ o ▲) y Reseñas alineado a la derecha. Donde no hay suficientes reseñas, la columna del promedio dice "Sin datos suficientes" en gris.

## Una nota sobre el entorno

`npm run build` del frontend falla en develop, y no es por H21: `lib/exportar-pdf.ts` (de H26) importa `jspdf` y `jspdf-autotable`, que **no están declarados en `package.json`**. Comprobé que ese archivo y el `package.json` de esta rama son idénticos a develop. Por lo mismo, `tests/reportes.test.tsx` no llega a cargar.

El panel de calificaciones no usa la exportación a PDF, así que funciona sin problema con `npm run dev` y sus pruebas pasan; lo que no compila es el build de producción, para cualquiera. Se arregla agregando las dos dependencias al `package.json`.

## Resumen

| Criterio | Casos | Resultado |
|---|---|---|
| 1. Promedio y total por entrenador, clase e instalaciones | QA-01 a QA-05, QA-F1 a QA-F3 | ✅ |
| 2. Rango de 30 días, recalculable y ordenable | QA-06 a QA-10, QA-F4 a QA-F6 | ✅ |
| 3. "Sin datos suficientes" con menos de 3 reseñas | QA-11, QA-12, QA-F7 | ✅ |
| 4. Rango inválido rechazado | QA-13 a QA-16, QA-F8 | ✅ |
| 5. Solo el administrador | QA-17, QA-18, QA-F9 | ✅ |

- `npm run test:e2e` (backend): **384/384** en 20 archivos (18 de H21).
- `npm test` (backend): **818/818** en 80 archivos (21 de H21).
- `npm test` (frontend): **245/245** casos (14 de H21). Un archivo, `tests/reportes.test.tsx` de H26, no llega a cargar por el `jspdf` que falta; ver la nota de abajo.
- `npm run lint` y `npm run build` del backend: sin errores.
- `npm run lint` del frontend: sin errores.
- Pantalla `/admin/calificaciones` revisada a **1024 px** con el administrador y con un entrenador.
