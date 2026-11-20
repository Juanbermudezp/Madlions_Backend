# QA-26.1. Pruebas del reporte de ocupación (Módulo 10)

**Historia:** H26. Reporte de ocupación de clases grupales
**Responsable:** David Alejandro Sandoval Quijano
**Fecha de ejecución:** 20/11/2026
**Entorno:** PostgreSQL 18 del docker-compose, migraciones aplicadas y datos de `npm run db:seed`.

## Cómo ejecutarlas

Todo se corre desde la terminal; no hace falta Swagger ni ninguna llamada manual a la API.

**Backend** (criterios 1 a 5 y 7 de punta a punta, contra la base real):

```bash
npm run test:e2e -- test/qa-reportes.e2e-spec.ts
```

Los casos QA-01 a QA-20 están automatizados en [test/qa-reportes.e2e-spec.ts](../../test/qa-reportes.e2e-spec.ts). La prueba crea sus propios datos con el prefijo `QA26` / `qa26-` (4 tipos de clase, 1 plan, 20 miembros con su membresía, 10 clases y sus reservas) y los borra al terminar. Solo compara las filas de sus propios tipos de clase, así que no le afectan otras clases que haya en la base.

**Frontend** (lo que el administrador ve en pantalla y el PDF que descarga):

```bash
npm test -- tests/qa-reportes.test.tsx
```

Los casos QA-F1 a QA-F13 están en `tests/qa-reportes.test.tsx` del repositorio del frontend. El PDF se genera de verdad con jsPDF y jspdf-autotable; la prueba solo intercepta la descarga para leer el archivo.

> **Hallazgo de QA (FE-26.2):** `lib/exportar-pdf.ts` importa `jspdf` y `jspdf-autotable`, pero ninguno de los dos estaba en el `package.json` del frontend. Con un `npm ci` limpio, `tests/reportes.test.tsx` fallaba al resolver el import y `next build` no podía compilar la exportación. Se agregaron las dos dependencias en el mismo PR de QA.

## Hoja de datos y resultados esperados (calculados a mano)

Los días son relativos a la fecha de la corrida (**H** = hoy, en hora de El Salvador). Entrenadores del seed: **Carlos** Martínez (`entrenador@madlions.com`) y **Ana** Hernández (`entrenador2@madlions.com`). Todas las clases duran una hora.

### Clases creadas

| Clase | Tipo     | Entrenador | Día y hora     | Estado                | Cupo | Reservas                                    | ¿Cuenta?                       |
| ----- | -------- | ---------- | -------------- | --------------------- | ---- | ------------------------------------------- | ------------------------------ |
| C1    | Spinning | Carlos     | H-3, 07:00     | Programada            | 20   | 19 confirmadas, 1 cancelada por el miembro  | Sí (solo las 19)               |
| C2    | Yoga     | Carlos     | H-10, 18:00    | Programada            | 10   | 6 confirmadas                               | Sí                             |
| C3    | Yoga     | Carlos     | H-3, 18:00     | Programada            | 10   | 4 confirmadas, 2 canceladas por el miembro  | Sí (solo las 4)                |
| C4    | Yoga     | Carlos     | H-5, 18:00     | Cancelada por el gimnasio | 10 | 5 canceladas por el gimnasio              | **No** (clase cancelada)       |
| C5    | Crossfit | Ana        | H-4, 10:00     | Programada            | 10   | 2 confirmadas, 1 cancelada por el gimnasio  | Sí (solo las 2)                |
| C6    | Spinning | Ana        | H-3, 09:00     | Programada            | 10   | 3 confirmadas                               | Sí                             |
| C7    | Crossfit | Carlos     | H-2, 10:00     | Programada            | 10   | 9 confirmadas                               | Sí                             |
| C8    | Box      | Carlos     | H-15, 23:00    | Programada            | 10   | 1 confirmada                                | Sí                             |
| C9    | Spinning | Carlos     | H+2, 07:00     | Programada            | 20   | 5 confirmadas                               | **No** (todavía no se imparte) |
| C10   | Spinning | Carlos     | Empezó hace 30 min | Programada        | 20   | 3 confirmadas                               | **No** (está en curso)         |

C8 empieza a las 23:00 de El Salvador, que en UTC ya es las 05:00 del día siguiente: sirve para comprobar que los días se cuentan en hora local.

### Resultado esperado: últimos 30 días (H-29 a H)

Ocupación = reservas confirmadas ÷ suma del cupo × 100, con un decimal. Etiqueta: `BAJA` si es menor que 30 %, `ALTA` si es 90 % o más.

| # | Tipo · entrenador  | Clases que cuentan | Veces | Reservas | Cupo        | Cálculo          | Ocupación | Etiqueta |
| - | ------------------ | ------------------ | ----- | -------- | ----------- | ---------------- | --------- | -------- |
| 1 | Spinning · Carlos  | C1                 | 1     | 19       | 20          | 19 ÷ 20 × 100    | 95.0 %    | ALTA     |
| 2 | Crossfit · Carlos  | C7                 | 1     | 9        | 10          | 9 ÷ 10 × 100     | 90.0 %    | ALTA     |
| 3 | Yoga · Carlos      | C2, C3             | 2     | 6 + 4 = 10 | 10 + 10 = 20 | 10 ÷ 20 × 100 | 50.0 %    | —        |
| 4 | Spinning · Ana     | C6                 | 1     | 3        | 10          | 3 ÷ 10 × 100     | 30.0 %    | —        |
| 5 | Crossfit · Ana     | C5                 | 1     | 2        | 10          | 2 ÷ 10 × 100     | 20.0 %    | BAJA     |
| 6 | Box · Carlos       | C8                 | 1     | 1        | 10          | 1 ÷ 10 × 100     | 10.0 %    | BAJA     |

Qué pasaría si el reporte contara lo que no debe (sirve para ver que la prueba sí detecta el error):

| Error                                   | Fila afectada     | Daría                                   |
| --------------------------------------- | ----------------- | --------------------------------------- |
| Contar la clase cancelada C4            | Yoga · Carlos     | 3 clases, 10 ÷ 30 = 33.3 %              |
| Contar las reservas canceladas          | Spinning · Carlos | 20 ÷ 20 = 100.0 %                       |
| Contar las clases C9 y C10 (no impartidas) | Spinning · Carlos | 3 clases, 27 ÷ 60 = 45.0 %           |

Si se quitan a propósito los dos filtros de estado de la consulta (`c.estado = 'PROGRAMADA'` y `estado = 'CONFIRMADA'`), deben fallar 8 de los 20 casos: QA-01, 02, 04, 05, 06, 08, 09 y 15. Con la consulta original pasan todos.

### Otros rangos

| Rango                                  | Resultado esperado                                                        |
| -------------------------------------- | ------------------------------------------------------------------------- |
| H-5 a H                                | Yoga · Carlos solo con C3: 1 clase, 4 ÷ 10 = 40.0 %; Box no aparece        |
| H-15 a H-15 (el día de C8)             | Solo Box · Carlos: 1 ÷ 10 = 10.0 %, BAJA                                  |
| H-14 a H-14 (el día siguiente en UTC)  | Sin filas                                                                 |
| 12 meses exactos (H-12 meses+1 día a H) | Se acepta; las mismas 6 filas                                            |
| 12 meses y un día (H-12 meses a H)     | 400 "El rango máximo es de 12 meses"                                      |
| H a H-1                                | 400 "La fecha de inicio no puede ser posterior a la de fin"               |
| 01/01/2000 a 31/01/2000                | 200 con `filas: []`                                                       |

## Casos de prueba

### Criterio 1 · Por tipo de clase y entrenador: veces, reservas confirmadas y ocupación con un decimal

| ID    | Caso                        | Pasos                                                 | Esperado                                                       | Resultado |
| ----- | --------------------------- | ----------------------------------------------------- | -------------------------------------------------------------- | --------- |
| QA-01 | Valores de la hoja          | `GET /reportes/ocupacion` sin fechas                  | Las 6 filas de la hoja con veces, reservas, cupo, ocupación y etiqueta | ✅ |
| QA-02 | Mismo tipo, dos entrenadores | Filas de Spinning                                    | Dos filas: Carlos 95 % y Ana 30 %                              | ✅        |
| QA-03 | Forma de cada fila          | Primera fila                                          | `tipoClase` y `entrenador` con `id` y `nombre`                 | ✅        |
| QA-F1 | Tabla en pantalla           | Render con las 6 filas de la hoja                     | Clase, entrenador, veces, reservas, cupo, "95.0 %" y etiqueta por fila, de mayor a menor | ✅ |
| QA-F2 | Gráfica de barras           | Render con las 6 filas de la hoja                     | Una barra por fila, en el mismo orden, con su porcentaje        | ✅        |

### Criterio 2 · Solo clases impartidas y reservas confirmadas

| ID    | Caso                              | Pasos                                       | Esperado                                                    | Resultado |
| ----- | --------------------------------- | ------------------------------------------- | ----------------------------------------------------------- | --------- |
| QA-04 | Clase cancelada por el gimnasio   | Fila de Yoga · Carlos                       | 2 clases, cupo 20 y 50 % (no 3 clases y 33.3 %)             | ✅        |
| QA-05 | Reservas canceladas               | Spinning · Carlos y Crossfit · Ana          | 19 y 2 reservas (sin la cancelada por el miembro ni por el gimnasio) | ✅ |
| QA-06 | Clases futuras y en curso         | Rango H-29 a H+5, fila de Spinning · Carlos | 1 clase, 19 reservas, cupo 20 y 95 % (C9 y C10 no cuentan)  | ✅        |

### Criterio 3 · Rango por defecto, recálculo y rechazo

| ID    | Caso                          | Pasos                                          | Esperado                                                              | Resultado |
| ----- | ----------------------------- | ---------------------------------------------- | --------------------------------------------------------------------- | --------- |
| QA-07 | Sin fechas                    | `GET /reportes/ocupacion`                      | `desde` = H-29 y `hasta` = H                                          | ✅        |
| QA-08 | Otro rango                    | `desde` = H-5, `hasta` = H                     | Yoga · Carlos: 1 clase, 4 ÷ 10 = 40 %; Box no aparece                 | ✅        |
| QA-09 | 12 meses exactos              | `desde` = H-12 meses+1 día, `hasta` = H        | 200 con las 6 filas de la hoja                                        | ✅        |
| QA-10 | 12 meses y un día             | `desde` = H-12 meses, `hasta` = H              | 400 "El rango máximo es de 12 meses"                                  | ✅        |
| QA-11 | Inicio posterior al fin       | `desde` = H, `hasta` = H-1                     | 400 "La fecha de inicio no puede ser posterior a la de fin"           | ✅        |
| QA-12 | Fecha inválida                | `2026-02-30` y `20-11-2026`                    | 400 en ambos                                                          | ✅        |
| QA-13 | Días en hora de El Salvador   | Rango del día de C8 y del día siguiente        | C8 (23:00 local) aparece en su día y no en el siguiente               | ✅        |
| QA-F3 | Pantalla al abrir             | Abrir `/admin/reportes`                        | Pide los últimos 30 días y el selector muestra esas fechas           | ✅        |
| QA-F4 | Aplicar otro rango            | Elegir 15/11 a 20/11 y "Aplicar"               | Se consulta ese rango y la tabla se recalcula                         | ✅        |
| QA-F5 | 12 meses en pantalla          | Elegir 21/11/2025 a 20/11/2026                 | Se acepta y se consulta                                               | ✅        |
| QA-F6 | 12 meses y un día en pantalla | Elegir 20/11/2025 a 20/11/2026                 | "El rango máximo es de 12 meses"; no se consulta la API               | ✅        |
| QA-F7 | Inicio posterior en pantalla  | Elegir 20/11/2026 a 19/11/2026                 | "La fecha de inicio no puede ser posterior a la de fin"; no se consulta | ✅      |

### Criterio 4 · Orden de mayor a menor y etiquetas

| ID    | Caso                     | Pasos                         | Esperado                                                          | Resultado |
| ----- | ------------------------ | ----------------------------- | ----------------------------------------------------------------- | --------- |
| QA-14 | Orden                    | Todas las filas del reporte   | Ocupación de mayor a menor                                        | ✅        |
| QA-15 | Etiquetas en los bordes  | Filas de la hoja              | 95 % y 90 % ALTA; 50 % y 30 % sin etiqueta; 20 % BAJA             | ✅        |

> QA-F1 revisa las mismas etiquetas en pantalla: "Alta demanda", "Baja ocupación" y "—" cuando no hay. Los bordes 29.9 %, 30 % y 90 % también están en las pruebas unitarias de `reglas-reporte.spec.ts`.

### Criterio 5 · Período sin clases impartidas

| ID    | Caso                 | Pasos                         | Esperado                                                               | Resultado |
| ----- | -------------------- | ----------------------------- | ---------------------------------------------------------------------- | --------- |
| QA-16 | Período vacío (API)  | Rango 01/01/2000 a 31/01/2000 | 200 con `filas: []`                                                    | ✅        |
| QA-F8 | Mensaje en pantalla  | Render con la lista vacía     | "No hay clases impartidas en este período"; "Exportar PDF" deshabilitado | ✅      |

### Criterio 6 · Exportar PDF

| ID    | Caso          | Pasos                                                   | Esperado                                                                                                                                       | Resultado |
| ----- | ------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| QA-F9 | PDF descargado | Ordenar por Clase y presionar "Exportar PDF"           | Archivo `reporte-ocupacion-2026-10-22-2026-11-20.pdf`, horizontal, con el título, "Período: 22/10/2026 al 20/11/2026", "Generado el dd/mm/aaaa hh:mm", los 7 encabezados y cada celda de las 6 filas en el orden visible | ✅ |

### Criterio 7 · Acceso solo para el administrador

| ID     | Caso                    | Pasos                                       | Esperado                         | Resultado |
| ------ | ----------------------- | ------------------------------------------- | -------------------------------- | --------- |
| QA-17  | Miembro (API)           | `miembro@madlions.com` consulta el reporte  | 403                              | ✅        |
| QA-18  | Entrenador (API)        | `entrenador@madlions.com`                   | 403                              | ✅        |
| QA-19  | Recepción (API)         | `recepcion@madlions.com`                    | 403                              | ✅        |
| QA-20  | Sin sesión (API)        | Sin token                                   | 401                              | ✅        |
| QA-F10 | Ruta protegida          | Layout de `/admin`                          | Solo admite ADMINISTRADOR        | ✅        |
| QA-F11 | Otros roles en pantalla | Miembro, entrenador y recepción abren la ruta | "Acceso denegado" sin el reporte | ✅      |
| QA-F12 | Administrador           | El administrador abre la ruta               | Ve el reporte                    | ✅        |
| QA-F13 | 403 de la API           | La API responde 403 al abrir la pantalla    | "Acceso denegado"                | ✅        |

## Resultado

| Ejecución                                           | Resultado                            |
| --------------------------------------------------- | ------------------------------------ |
| `npm run test:e2e -- test/qa-reportes.e2e-spec.ts`  | ✅ 20 de 20 (corrida 3 veces seguidas) |
| `npm run test:e2e` (toda la suite)                  | ✅ 358 de 358 (19 archivos)            |
| Frontend `npm test -- tests/qa-reportes.test.tsx`   | ✅ 15 de 15                           |
| Frontend `npm test` (toda la suite)                 | ✅ 260 de 260 (19 archivos)           |

Todos los criterios de aceptación de H26 tienen al menos un caso y todos pasan.

## Pruebas relacionadas

| Archivo                                          | Qué cubre                                                                   |
| ------------------------------------------------ | --------------------------------------------------------------------------- |
| `src/reportes/services/reglas-reporte.spec.ts`   | Rango por defecto, 12 meses, redondeo y etiquetas en 29.9 %, 30 % y 90 % (definición de terminado de BE-26.1) |
| `src/reportes/services/reportes.service.spec.ts` | Conversión del rango a hora de El Salvador y orden de las filas             |
| Frontend `tests/reportes.test.tsx`               | Pruebas de FE-26.1 y FE-26.2 (rango, orden, resumen, estados y datos del PDF) |
