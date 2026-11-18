# QA-18.1. Pruebas del registro de mantenimiento y retorno a servicio

**Historia:** H18. Registro de mantenimiento y retorno a servicio
**Responsable:** Gabriel Alejandro Batres Flores
**Fecha de ejecución:** 18/11/2026
**Entorno:** API local (puerto 8000), PostgreSQL 18 del docker-compose, datos de `npm run db:seed`; frontend con `npm run dev` (puerto 3000) y el navegador integrado, a 375 px, 1024 px y 1280 px.
**Herramientas:** pruebas e2e con Vitest + Supertest (`npm run test:e2e`), pruebas unitarias del backend (`npm test`) y del frontend (`npm test`), script SQL contra la base real (`psql`) y recorrido en el navegador.

## Cómo ejecutar

```bash
docker compose up -d postgres
npm run prisma:deploy && npm run db:seed
npm run test:e2e
```

Los casos QA-01 a QA-25 están automatizados en [test/maquinas-mantenimiento.e2e-spec.ts](../../test/maquinas-mantenimiento.e2e-spec.ts). Cada caso crea su propia máquina `MAQ-7xx`, así que ninguno depende de otro ni del orden; al terminar las borra todas y con ellas su historial (`ON DELETE CASCADE`). El inventario del seed queda igual que antes de correrlas.

Las pruebas de la tabla van aparte, en [docs/qa/DB-18.1-prueba-tabla-historial.sql](DB-18.1-prueba-tabla-historial.sql):

```bash
docker compose exec -T postgres psql -U postgres -d si_be_boilerplate -v ON_ERROR_STOP=1 < docs/qa/DB-18.1-prueba-tabla-historial.sql
```

Todo el script corre dentro de `BEGIN … ROLLBACK`, así que no deja nada en la base.

Para la pantalla, en `Madlions_Frontend`:

```bash
npm run dev
```

## Datos de prueba

| Dato | Valor |
|---|---|
| Administrador | admin@madlions.com / `Demo1234!` (Alberto Ramírez) |
| Entrenador | entrenador@madlions.com / `Demo1234!` (Carlos Martínez) |
| Recepción | recepcion@madlions.com / `Demo1234!` (Rosa Pérez) |
| Miembro | miembro@madlions.com / `Demo1234!` (María López) |
| Inventario del seed | 12 máquinas, `MAQ-001` a `MAQ-012`, todas operativas y sin historial |
| Máquinas de las pruebas e2e | `MAQ-701` a `MAQ-725`, una por caso |

No hace falta ningún fixture a mano: con el seed basta, porque H18 es justamente la historia que cambia los estados. El recorrido en el navegador se hizo sobre `MAQ-001` y al terminar se la devolvió a su estado:

```sql
DELETE FROM historial_maquina WHERE maquina_id = (SELECT id FROM maquina WHERE codigo = 'MAQ-001');
UPDATE maquina SET estado = 'OPERATIVA', fecha_estimada_retorno = NULL,
  ultimo_motivo = NULL, ultimo_cambio_por = NULL WHERE codigo = 'MAQ-001';
```

## Casos de prueba por criterio de aceptación

Los casos `QA-nn` son automáticos (e2e contra la API); los `QA-Fnn` son del recorrido en el navegador.

### Criterio 1. El administrador y el entrenador cambian el estado con motivo obligatorio y fecha estimada opcional

| ID | Caso | Petición / acción | Esperado | Resultado |
|---|---|---|---|---|
| QA-01 | El administrador pone una máquina en mantenimiento | `POST /maquinas/{id}/estado` `{ estado, motivo, fechaEstimadaRetorno }` | 200 con el estado nuevo, la fecha, el motivo y el usuario | ✅ |
| QA-02 | El entrenador también puede (supuesto S13) | Lo mismo como entrenador | 200 y queda su usuario | ✅ |
| QA-03 | La fecha estimada es opcional | `POST` sin `fechaEstimadaRetorno` | 200 con `fechaEstimadaRetorno: null` | ✅ |
| QA-04 | El cambio queda guardado | `GET /maquinas?estado=EN_MANTENIMIENTO` después del cambio | La máquina aparece con el estado nuevo | ✅ |
| QA-05 | Motivo obligatorio de 5 a 250 | `POST` sin motivo, con 4, con solo espacios y con 251 | 400 en los 4, y la máquina no cambia | ✅ |
| QA-06 | Máquina inexistente | `POST /maquinas/{uuid que no existe}/estado` | 404 "La máquina no existe." | ✅ |
| QA-F1 | Botón "Cambiar estado" en el detalle | `/equipo/{id}` como administrador | El botón abre el formulario con Estado nuevo, Motivo y Fecha estimada | ✅ |
| QA-F2 | Guardar un cambio desde la pantalla | Mantenimiento + motivo + 28/11/2026 | Aviso "Estado actualizado" y la tarjeta pasa a "En mantenimiento" | ✅ Texto exacto |
| QA-F3 | El motivo corto se corta antes de llamar a la API | Motivo "abcd" → Guardar | Error bajo el campo, borde rojo, contador 4/250, no se envía | ✅ |
| QA-F4 | El entrenador hace su propio cambio | `/equipo/{id}` como entrenador → Fuera de servicio | "Estado actualizado" y el historial lo atribuye a Carlos Martínez | ✅ |

### Criterio 2. Al marcar "Operativa" queda la fecha y hora de retorno y se borra la fecha estimada

| ID | Caso | Petición / acción | Esperado | Resultado |
|---|---|---|---|---|
| QA-07 | Volver a operativa borra la fecha estimada | `POST` con `estado: OPERATIVA` sobre una en mantenimiento | 200 con `fechaEstimadaRetorno: null`, y también null en la base | ✅ |
| QA-08 | La fecha y hora del retorno queda registrada | `GET /maquinas/{id}/historial` después del retorno | El cambio a OPERATIVA trae `cambiadoEn` posterior al inicio de la prueba | ✅ |
| QA-09 | También desde "Fuera de servicio" | `POST` con `estado: OPERATIVA` sobre una fuera de servicio | 200 | ✅ |
| QA-F5 | La fecha estimada desaparece de la tarjeta | Marcar operativa desde la pantalla | La línea "Retorno estimado" deja de mostrarse | ✅ |
| QA-F6 | El formulario no pide fecha al volver a operativa | Elegir "Operativa" en el desplegable | El campo de fecha se oculta | ✅ |

> La fecha y hora del retorno es el `cambiadoEn` de la fila del historial: DB-18.1 no agrega una columna a `maquina`, y el historial es el registro de cuándo pasó cada cambio.

### Criterio 3. Cada cambio queda en el historial con fecha, hora, estados, motivo y usuario, del más reciente al más antiguo

| ID | Caso | Petición / acción | Esperado | Resultado |
|---|---|---|---|---|
| QA-10 | El historial trae los seis datos | `GET /maquinas/{id}/historial` | `estadoAnterior`, `estadoNuevo`, `motivo`, `fechaEstimadaRetorno`, `usuario` y `cambiadoEn` | ✅ |
| QA-11 | Tres cambios, del más reciente al más antiguo | Tres `POST` seguidos y un `GET` del historial | 3 filas en orden inverso al de los cambios | ✅ |
| QA-12 | Cada cambio encadena los estados | Dos cambios y un `GET` | El `estadoAnterior` de cada fila es el `estadoNuevo` del cambio previo | ✅ |
| QA-13 | Máquina sin cambios | `GET` del historial de una máquina recién creada | 200 con la lista vacía | ✅ |
| QA-14 | Máquina inexistente | `GET /maquinas/{uuid que no existe}/historial` | 404 | ✅ |
| QA-15 | Un cambio rechazado no deja rastro | Un `POST` que falla por motivo corto | El historial sigue vacío | ✅ |
| QA-F7 | Tabla de historial en la pantalla | `/equipo/{id}` después de dos cambios | Columnas Fecha, Anterior, Nuevo, Motivo y Usuario, el más reciente arriba | ✅ |
| QA-F8 | Mensaje cuando no hay historial | `/equipo/{id}` de una máquina sin cambios | "Esta máquina todavía no ha cambiado de estado" | ✅ |
| QA-F9 | La hora se muestra en hora de El Salvador | Cambio hecho a las 09:42 locales | "18 nov 2026, 09:42" | ✅ |

### Criterio 4. Mismo estado, fecha estimada pasada o fecha al volver a "Operativa" se rechazan y la máquina no cambia

| ID | Caso | Petición / acción | Esperado | Resultado |
|---|---|---|---|---|
| QA-16 | Mismo estado | `POST` con el estado en el que ya está | 409 "La máquina ya está en ese estado." | ✅ Mensaje exacto |
| QA-17 | Fecha estimada de ayer | `POST` con `fechaEstimadaRetorno` = ayer | 400 | ✅ |
| QA-18 | Fecha estimada de hoy | `POST` con `fechaEstimadaRetorno` = hoy | 200 (hoy sí vale) | ✅ |
| QA-19 | Fecha estimada al volver a operativa | `POST` con `estado: OPERATIVA` y fecha | 400 | ✅ |
| QA-20 | Estado inventado o fecha mal escrita | `POST` con `estado: "ROTA"` y con `01/12/2026` | 400 en los 2 | ✅ |
| QA-21 | Tras un rechazo la máquina queda igual | Dos `POST` rechazados y lectura directa de la base | Estado, fecha estimada y motivo sin cambios | ✅ |
| QA-F10 | El formulario no ofrece el estado actual | Abrir el formulario de una operativa y de una en mantenimiento | El desplegable solo trae los otros dos estados | ✅ |
| QA-F11 | El selector de fecha no deja elegir días pasados | Campo de fecha del formulario | Tiene `min` en la fecha de hoy | ✅ Si se escribe igual, la rechazan la prueba unitaria del frontend y QA-17 |

> QA-F10 es la razón de que el 409 no se alcance desde la pantalla: el estado actual no es una opción. El caso igual está cubierto por QA-16, para una petición directa a la API o una pantalla desactualizada.

### Criterio 5. El miembro y recepción reciben "Acceso denegado"

| ID | Caso | Petición / acción | Esperado | Resultado |
|---|---|---|---|---|
| QA-22 | No pueden cambiar el estado | `POST /maquinas/{id}/estado` como miembro y como recepción | 403 en los 2 y la máquina no cambia | ✅ |
| QA-23 | No pueden ver el historial | `GET /maquinas/{id}/historial` como miembro y como recepción | 403 en los 2, y el motivo no aparece en la respuesta | ✅ |
| QA-24 | El administrador y el entrenador sí | Los dos endpoints con los dos roles | 200 en los 4 | ✅ |
| QA-25 | Sin sesión | Los dos endpoints sin token | 401 en los 2 | ✅ |
| QA-F12 | Para el miembro la tarjeta no es clicable | `/equipo` como miembro | El nombre de la máquina no es un enlace | ✅ |
| QA-F13 | `/equipo/{id}` compartido con un miembro | Abrir el enlace del detalle como miembro | Lo lleva al listado, no a una pantalla de error | ✅ |

## Pruebas realizadas en cada actividad de H18

### Actividad 1. DB-18.1. Tabla de historial de estados

**Cómo:** el script [DB-18.1-prueba-tabla-historial.sql](DB-18.1-prueba-tabla-historial.sql) corre contra la base real dentro de una transacción que termina en `ROLLBACK`. Son **19 casos en 10 bloques**, con máquinas de prueba `MAQ-95x`.

| Bloque | Qué cubre | Resultado |
|---|---|---|
| H1 | Un cambio válido guarda los dos estados, motivo, fecha estimada, usuario y fecha y hora | ✅ |
| H2 | `cambiado_en` toma la fecha y hora actual por defecto | ✅ |
| H3 | CHECK `estado_anterior <> estado_nuevo` (criterio técnico) | ✅ Rechaza los iguales |
| H4 | Motivo obligatorio de 5 a 250 | ✅ Rechaza 4, solo espacios, 251 y nulo |
| H5 | Un retorno a OPERATIVA no lleva fecha estimada | ✅ |
| H6 | Las FK de máquina y usuario, y que el usuario no puede faltar | ✅ |
| H7 | Borrar la máquina borra su historial (`ON DELETE CASCADE`) | ✅ |
| H8 | No se puede borrar al usuario que hizo un cambio (`ON DELETE RESTRICT`) | ✅ |
| H9 | El historial se lee del más reciente al más antiguo | ✅ |
| H10 | Índice `(maquina_id, cambiado_en)` que pide la ficha | ✅ |

| Caso | Esperado | Resultado |
|---|---|---|
| Migración reversible | `down.sql` borra la tabla y volver a aplicar la migración la recrea | ✅ Probado dentro de una transacción, sin tocar los datos reales |

> H8 encontró un error de la propia prueba: el `ON DELETE RESTRICT` levanta `23001` (restrict_violation), no `23503` (foreign_key_violation), que era lo que esperaba el caso. Se corrigió la expectativa; la restricción siempre estuvo bien.

### Actividad 2. BE-18.1. Cambio de estado e historial

**Pruebas unitarias, en `src/maquinas/` (58 en total con las de H17):**

| Archivo | Qué cubre de H18 |
|---|---|
| `dto/maquina.dto.spec.ts` | El cuerpo del cambio: estado ausente o inventado, motivo ausente, de 4, de 5, de 250, de 251 y de solo espacios, recorte de espacios, fecha vacía como "sin fecha", fechas mal escritas o inexistentes (`2026-02-30`) y campos fuera del contrato; y que el DTO del historial no arrastra `maquinaId` ni `cambiadoPorId` |
| `services/reglas-maquina.spec.ts` | Las tres reglas puras: mismo estado, error de la fecha estimada (ayer, hoy, al volver a operativa) y el borrado de la fecha estimada al retornar |
| `services/maquinas.service.spec.ts` | Que el cambio llega al repositorio con el estado anterior, el motivo y el usuario; el 404, el 409 y los dos 400; que tras un rechazo no se llama al repositorio; y el 409 cuando otra petición gana la carrera |

El reloj se simula con `vi.setSystemTime`, así que los casos de "ayer" y "hoy" no dependen del día en que se corran.

**Prueba de la transacción (criterio técnico):** QA-15 confirma el efecto que importa — un cambio rechazado no deja fila en el historial. En el repositorio, el `UPDATE` exige que la máquina siga en el estado anterior (`updateMany` con `where: { id, estado }`), así que si otra petición cambia el estado en el medio no se registra un cambio que no pasó; eso es lo que cubre el último caso unitario del servicio.

### Actividad 3. FE-18.1. Detalle de máquina con cambio de estado

**Pruebas unitarias del frontend (21), en `tests/maquinas.test.ts` del repositorio `Madlions_Frontend`:** los estados que ofrece el formulario, cuándo se pide la fecha, quién puede gestionar máquinas, las validaciones del formulario (las mismas reglas que el backend), el campo al que corresponde cada error del backend, la hora en hora de El Salvador, y la Server Action: ruta y método, motivo recortado, fecha enviada solo cuando corresponde, `revalidatePath` del área del rol, y que miembro y recepción no llegan a llamar a la API.

**Recorrido en el navegador:** `npm run dev` contra la API local, con los cuatro usuarios del seed, a 375 px, 1024 px y 1280 px.

| Caso | Resultado |
|---|---|
| La tarjeta del listado abre el detalle (administrador y entrenador) | ✅ Toda la tarjeta es clicable |
| `/equipo/{id}` lleva al detalle del área del rol | ✅ `/admin/equipo/{id}` y `/entrenador/equipo/{id}` |
| Estado de carga del detalle | ✅ "Cargando la máquina…" |
| El aviso "Estado actualizado" se cierra solo | ✅ |
| La pantalla se actualiza sola tras guardar | ✅ Tarjeta e historial, sin recargar a mano |
| A 375 px la página no se desplaza a lo ancho | ✅ |

**Cómo se ve a 1280 px:** arriba, el enlace "← Estado del equipo". Debajo, una tarjeta con la franja de color del estado a la izquierda, el nombre de la máquina en grande, el código en gris monoespaciado y la insignia del estado a la derecha; luego, en dos columnas, Tipo, Zona, Retorno estimado (solo si no está operativa), Último motivo y Último cambio; y abajo el botón negro "Cambiar estado". Sigue "Historial de cambios" con una tabla de borde gris y las columnas Fecha, Anterior, Nuevo, Motivo y Usuario, con los estados como insignias de color y el cambio más reciente arriba. El formulario se abre en una ventana centrada sobre el fondo oscurecido: el desplegable "Estado nuevo" (sin el estado actual), el área de texto "Motivo" con contador `0/250`, y "Fecha estimada de retorno (opcional)" solo cuando el estado nuevo no es "Operativa". Los errores salen en rojo bajo cada campo.

**Cómo se ve a 375 px:** el menú lateral se oculta (comportamiento del Shell del Módulo 0). Los datos de la tarjeta pasan a una sola columna y el botón queda debajo. La tabla del historial se reemplaza por una tarjeta por cambio: la fecha y hora arriba en gris, las dos insignias con una flecha entre ellas, el motivo y el usuario. El formulario sube desde abajo y ocupa todo el ancho.

## Cambio en una prueba de H17

QA-23 de [test/maquinas.e2e-spec.ts](../../test/maquinas.e2e-spec.ts) comprobaba que en H17 ningún rol podía cambiar el estado **porque el endpoint todavía no existía** (404 para los cuatro roles). Con H18 el endpoint existe, así que ese caso pasó a comprobar lo que de verdad pide el criterio 5 de H17: que el miembro y recepción reciben 403 y la máquina no cambia.

## Resumen

| Criterio | Casos | Resultado |
|---|---|---|
| 1. Cambio con motivo obligatorio y fecha opcional | QA-01 a QA-06, QA-F1 a QA-F4 | ✅ |
| 2. Retorno a "Operativa": queda la fecha y hora y se borra la estimada | QA-07 a QA-09, QA-F5 y QA-F6 | ✅ |
| 3. Historial completo, del más reciente al más antiguo | QA-10 a QA-15, QA-F7 a QA-F9 | ✅ |
| 4. Mismo estado y fechas inválidas se rechazan | QA-16 a QA-21, QA-F10 y QA-F11 | ✅ |
| 5. Miembro y recepción: "Acceso denegado" | QA-22 a QA-25, QA-F12 y QA-F13 | ✅ |

- `npm run test:e2e` (backend): **213/213** en 11 archivos (25 de H18).
- `npm test` (backend): **613/613** en 62 archivos.
- `npm test` (frontend): **103/103** en 9 archivos (21 de H18).
- `DB-18.1-prueba-tabla-historial.sql`: **19/19**, más la migración reversible.
- `npm run lint` y `npm run build` del backend y del frontend: sin errores.
- Pantalla `/equipo/{id}` revisada a **375 px**, **1024 px** y **1280 px**, con los cuatro roles.
