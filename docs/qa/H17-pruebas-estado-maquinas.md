# QA-17.1. Pruebas de la consulta del estado de las máquinas

**Historia:** H17. Consulta del estado de las máquinas
**Responsable:** Gabriel Alejandro Batres Flores
**Fecha de ejecución:** 15/11/2026
**Entorno:** API local (puerto 8000), PostgreSQL 18 del docker-compose, datos de `npm run db:seed`; frontend con `npm run dev` (puerto 3000) y el navegador integrado, a 1024 px y a 375 px.
**Herramientas:** pruebas e2e con Vitest + Supertest (`npm run test:e2e`), pruebas unitarias (`npm test`), script SQL contra la base real (`psql`) y recorrido en el navegador.

## Cómo ejecutar

```bash
docker compose up -d postgres
npm run prisma:deploy && npm run db:seed
npm run test:e2e
```

Los casos QA-01 a QA-23 están automatizados en [test/maquinas.e2e-spec.ts](../../test/maquinas.e2e-spec.ts). Levantan la API real (mismo prefijo `api/v1` y `ValidationPipe` que `main.ts`), inician sesión con los usuarios del seed, crean tres máquinas de prueba (`MAQ-801`, `MAQ-802`, `MAQ-803`) y las borran al terminar. El inventario del seed queda igual que antes de correrlas.

Las pruebas de la tabla van aparte, en [docs/qa/DB-17.1-prueba-tabla-maquina.sql](DB-17.1-prueba-tabla-maquina.sql):

```bash
docker compose exec -T postgres psql -U postgres -d si_be_boilerplate -v ON_ERROR_STOP=1 < docs/qa/DB-17.1-prueba-tabla-maquina.sql
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
| Inventario del seed | 12 máquinas, `MAQ-001` a `MAQ-012`, todas operativas |
| Tipos y zonas del seed | Cardio (5), Fuerza (3), Peso libre (2), Funcional (2); Piso 1 (4), Piso 2 (5), Área funcional (3) |
| Máquinas de las pruebas e2e | `MAQ-801` en mantenimiento con fecha y motivo, `MAQ-802` fuera de servicio sin fecha, `MAQ-803` operativa |

### Fixture para revisar la pantalla a mano

El seed deja las 12 máquinas operativas, así que para ver los tres colores, la fecha estimada y los datos internos hay que poner dos máquinas en otro estado:

```sql
UPDATE maquina SET estado = 'EN_MANTENIMIENTO', fecha_estimada_retorno = '2026-11-28',
  ultimo_motivo = 'Banda desgastada, se espera el repuesto del proveedor.',
  ultimo_cambio_por = (SELECT id FROM usuario WHERE email = 'admin@madlions.com')
  WHERE codigo = 'MAQ-002';
UPDATE maquina SET estado = 'FUERA_DE_SERVICIO', fecha_estimada_retorno = NULL,
  ultimo_motivo = 'Cable de acero reventado, pendiente de dictamen tecnico.',
  ultimo_cambio_por = (SELECT id FROM usuario WHERE email = 'entrenador@madlions.com')
  WHERE codigo = 'MAQ-005';
```

Al terminar hay que devolverlas a su estado, porque las pruebas e2e esperan el inventario del seed:

```sql
UPDATE maquina SET estado = 'OPERATIVA', fecha_estimada_retorno = NULL,
  ultimo_motivo = NULL, ultimo_cambio_por = NULL
  WHERE codigo IN ('MAQ-002', 'MAQ-005');
```

> El seed no las devuelve solo: es idempotente por código y no pisa el estado, justamente para no borrar lo que registre H18.

## Casos de prueba por criterio de aceptación

Los casos `QA-nn` son automáticos (e2e contra la API); los `QA-Fnn` son del recorrido en el navegador.

### Criterio 1. Cada máquina con nombre, tipo, zona y estado, en verde, amarillo o rojo, y un resumen por estado

| ID | Caso | Petición / acción | Esperado | Resultado |
|---|---|---|---|---|
| QA-01 | El miembro recibe los campos de la ficha | `GET /maquinas` (miembro) | Cada máquina con `id`, `codigo`, `nombre`, `tipo`, `zona`, `estado`, `fechaEstimadaRetorno` | Exactamente esas 7 claves |
| QA-02 | El resumen trae los tres estados | `GET /maquinas` (miembro) | Las 3 claves, y la suma es el inventario completo | Suma = `maquina.count()` |
| QA-03 | El resumen cuenta bien | `GET /maquinas` contra `COUNT` por estado en la base | Cada contador coincide | Los 3 coinciden |
| QA-04 | Los cuatro roles consultan | `GET /maquinas` (admin, entrenador, recepción, miembro) | 200 | 200 en los 4 |
| QA-05 | Sin sesión | `GET /maquinas` sin token | 401 | 401 |
| QA-F1 | Tarjetas con los cuatro datos | `/equipo` como miembro | Cada tarjeta con nombre, código, Tipo, Zona y la etiqueta de estado | Las 12 |
| QA-F2 | Colores por estado | Misma pantalla con el fixture | "Operativa" verde, "En mantenimiento" amarillo, "Fuera de servicio" rojo, en la insignia y en la franja de la tarjeta | Los 3 colores |
| QA-F3 | Resumen arriba con 3 contadores de color | Misma pantalla | `10` verde, `1` amarillo, `1` rojo sobre los filtros | Cumple |

### Criterio 2. Al filtrar por estado, tipo o zona solo se ven las máquinas que cumplen todos los filtros

| ID | Caso | Petición / acción | Esperado | Resultado |
|---|---|---|---|---|
| QA-06 | Filtrar por estado | `GET /maquinas?estado=EN_MANTENIMIENTO` | Solo las de ese estado | Cumple |
| QA-07 | Filtrar por tipo | `GET /maquinas?tipo=CARDIO` | Solo cardio | Cumple |
| QA-08 | Filtrar por zona | `GET /maquinas?zona=PISO_2` | Solo piso 2 | Cumple |
| QA-09 | Los tres filtros juntos | `GET /maquinas?estado=&tipo=&zona=` con los tres valores | Solo las que cumplen los tres (AND) | Cumple |
| QA-10 | Una combinación sin resultados | `GET /maquinas?estado=FUERA_DE_SERVICIO&tipo=CARDIO` | Lista vacía, no error | 200 con `maquinas: []` |
| QA-11 | Filtro vacío = todos | `GET /maquinas?estado=&tipo=&zona=` | 200 con el inventario completo | Cumple |
| QA-12 | Estado, tipo o zona inexistente | `GET /maquinas?estado=ROTA` (y tipo y zona) | 400 con el mensaje del campo | 400 en los 3 |
| QA-13 | Filtro fuera del contrato | `GET /maquinas?activo=true` | 400 | 400 |
| QA-14 | El filtro de estado no recorta el resumen | `GET /maquinas?estado=EN_MANTENIMIENTO` y `?tipo=CARDIO` | El de estado deja los 3 contadores; el de tipo y zona sí los recorta | Cumple |
| QA-F4 | Los filtros son listas desplegables | `/equipo` | Tres `select`: Estado, Tipo y Zona, con "Todos" | Cumple |
| QA-F5 | El filtro se refleja en la URL | Elegir Tipo = Cardio | La URL pasa a `?tipo=CARDIO` y la lista queda en 5 | Cumple |
| QA-F6 | Varios filtros en la URL | Agregar Estado = Fuera de servicio | `?estado=FUERA_DE_SERVICIO&tipo=CARDIO`, 1 máquina | Cumple |
| QA-F7 | Abrir una URL compartida | Entrar directo a `/miembro/equipo?tipo=PESO_LIBRE&zona=PISO_1` | Los desplegables ya traen "Peso libre" y "Piso 1" | Cumple |
| QA-F8 | Quitar filtros | Botón "Quitar filtros" | Vuelve a `/miembro/equipo` sin query y a las 12 máquinas | Cumple |
| QA-F9 | Valor inválido en una URL compartida | Entrar a `/entrenador/equipo?estado=ROTA` | La pantalla no se rompe: muestra el inventario completo y el desplegable en "Todos" | Cumple |
| QA-F10 | El resumen no se pone en cero al filtrar por estado | Estado = Fuera de servicio con Tipo = Cardio | Sigue mostrando 3 / 1 / 1 y una nota que lo explica | Cumple |

> QA-F9: el frontend descarta el valor que no está en el contrato en vez de mostrar el 400 del backend, porque ese error no se arregla con el botón Reintentar. El backend sí lo rechaza (QA-12), que es lo que pide la ficha.

### Criterio 3. Una máquina que no está operativa muestra su fecha estimada de retorno o "Sin fecha estimada"

| ID | Caso | Petición / acción | Esperado | Resultado |
|---|---|---|---|---|
| QA-15 | En mantenimiento con fecha | `GET /maquinas` (`MAQ-801`) | `fechaEstimadaRetorno` como `AAAA-MM-DD` | Sin hora ni desfase |
| QA-16 | Fuera de servicio sin fecha | `GET /maquinas` (`MAQ-802`) | `fechaEstimadaRetorno: null` | Cumple |
| QA-17 | Operativa | `GET /maquinas` (`MAQ-803`) | `fechaEstimadaRetorno: null` | Cumple |
| QA-F11 | Fecha en la tarjeta | `/equipo` con el fixture (`MAQ-002`) | "Retorno estimado: 28 de noviembre de 2026" | Sin correrse un día |
| QA-F12 | Sin fecha | `MAQ-005`, fuera de servicio sin fecha | "Retorno estimado: Sin fecha estimada" | Texto exacto |
| QA-F13 | Operativa | Cualquiera de las otras 10 | La tarjeta no trae la línea de retorno | Cumple |

### Criterio 4. Ningún resultado cumple los filtros

| ID | Caso | Petición / acción | Esperado | Resultado |
|---|---|---|---|---|
| QA-18 | Combinación vacía | `GET /maquinas?tipo=PESO_LIBRE&zona=PISO_1` | 200, `maquinas: []` y el resumen en 0 | Cumple |
| QA-F14 | Mensaje en la pantalla | `/miembro/equipo?tipo=PESO_LIBRE&zona=PISO_1` | "No hay máquinas con esos filtros" | Texto exacto, con los contadores en 0 |

### Criterio 5. El miembro no ve el motivo interno ni quién hizo el último cambio, y no puede modificar el estado

| ID | Caso | Petición / acción | Esperado | Resultado |
|---|---|---|---|---|
| QA-19 | El miembro no recibe los datos internos | `GET /maquinas` (miembro) | Sin `ultimoMotivo` ni `ultimoCambioPor` | Las claves no existen, y el motivo y el id del admin no aparecen en el texto crudo de la respuesta |
| QA-20 | Recepción tampoco | `GET /maquinas` (recepción) | Igual que el miembro | Cumple |
| QA-21 | Administrador y entrenador sí | `GET /maquinas` (admin y entrenador) | Con `ultimoMotivo` y `ultimoCambioPor` | Con el nombre y apellido de quien cambió |
| QA-22 | Máquina que nunca cambió | `MAQ-803` como admin | Las dos claves presentes en `null` | Cumple |
| QA-23 | Nadie puede cambiar el estado en H17 | `POST /maquinas/{id}/estado` con los 4 roles | El endpoint no existe (404) y la máquina no cambia | 404 en los 4; el estado sigue igual |
| QA-F15 | El miembro no ve el motivo en la pantalla | `/equipo` como miembro, con el fixture | Las tarjetas no traen Motivo ni Último cambio | Cumple |
| QA-F16 | Recepción tampoco | `/equipo` como recepción | Igual | Cumple |
| QA-F17 | Administrador y entrenador sí | `/equipo` como admin y como entrenador | "Motivo: …" y "Último cambio: Alberto Ramírez" bajo la tarjeta | En los 2 |
| QA-F18 | La pantalla no permite cambiar el estado | Revisión de `/equipo` en los 4 roles | Ningún botón, formulario ni enlace para cambiar el estado | La pantalla es de solo lectura |

> QA-F15 y QA-F16 funcionan porque el backend no manda esos campos (criterio técnico de BE-17.1): el frontend solo los pinta si vienen, no los esconde.

## Pruebas realizadas en cada actividad de H17

### Actividad 1. DB-17.1. Tabla de máquinas e inventario inicial

**Cómo:** el script [DB-17.1-prueba-tabla-maquina.sql](DB-17.1-prueba-tabla-maquina.sql) corre contra la base real dentro de una transacción que termina en `ROLLBACK`. Son **33 casos en 9 bloques**, con máquinas de prueba `MAQ-9xx`.

| Bloque | Qué cubre | Resultado |
|---|---|---|
| C1 | Valores por defecto: estado `OPERATIVA`, `actualizado_en` con fecha | Cumple |
| C2 | Formato del código (`MAQ-001`), código repetido | Rechaza `MAQ-1`, `maq-001`, `MAQ-0001` y el repetido |
| C3 | Largo del nombre (2 a 60, recortando espacios) | Cumple |
| C4 | Los tres enums: valores válidos y uno inventado | Cumple |
| C5 | Motivo nulo, de 5 a 250 caracteres | Rechaza 4 y 251 |
| C6 | Coherencia estado / fecha estimada: una operativa no puede tener fecha | Cumple |
| C7 | FK del usuario: `ON DELETE SET NULL` | Al borrar el usuario, la máquina queda con `ultimo_cambio_por` nulo |
| C8 | Índice único del código | Cumple |
| C9 | Inventario del seed: 12 máquinas, todas operativas, los 4 tipos y las 3 zonas | Cumple |

| Caso | Esperado | Resultado |
|---|---|---|
| Migración reversible | `down.sql` borra la tabla y los 3 enums; volver a aplicar la migración la recrea | Probado dentro de una transacción, sin tocar los datos reales |
| Seed idempotente | Correrlo dos veces más deja 12 máquinas y no pisa el estado puesto a mano | `MAQ-003` quedó en mantenimiento después de dos seeds |

### Actividad 2. BE-17.1. Consulta de máquinas

**Pruebas unitarias, en `src/maquinas/`:**

| Archivo | Qué cubre |
|---|---|
| `dto/maquina.dto.spec.ts` | Los filtros: sin filtros, los tres juntos, vacío = todos, valores inválidos (y que el error apunta al campo correcto), parámetro fuera del contrato; y que `MaquinaResponseDto` produce exactamente las 7 claves públicas con la fecha como `AAAA-MM-DD`, y `MaquinaInternaResponseDto` agrega las 2 internas |
| `services/reglas-maquina.spec.ts` | Qué roles ven los datos internos, con los 4 roles |
| `services/maquinas.service.spec.ts` | El DTO que se elige según el rol, que los filtros llegan al repositorio y que el resumen se cuenta **sin** el filtro de estado |

**Pruebas e2e:** los 23 casos de arriba, contra la API real.

### Actividad 3. FE-17.1. Pantalla de estado del equipo

**Cómo:** `npm run dev` en el frontend contra la API local, recorrido en el navegador integrado iniciando sesión con los cuatro usuarios del seed, a 1024 px y a 375 px, con el fixture de dos máquinas no operativas.

| Caso | Resultado |
|---|---|
| `/equipo` lleva a la pantalla del rol | Miembro → `/miembro/equipo`, admin → `/admin/equipo`, recepción → `/recepcion/equipo` |
| `/equipo?estado=EN_MANTENIMIENTO` conserva el filtro al redirigir | `/admin/equipo?estado=EN_MANTENIMIENTO` |
| La opción "Estado del equipo" del menú queda resaltada | En los 4 roles |
| Estado de carga mientras llega la respuesta | "Cargando el estado del equipo…" |
| Estado vacío con una combinación sin resultados | "No hay máquinas con esos filtros" |
| A 375 px la página no se desplaza a lo ancho | Cumple |

**Cómo se ve a 1024 px:** menú lateral a la izquierda con "Estado del equipo" resaltado. Arriba, el título "Estado del equipo" y una línea de descripción. Debajo, tres tarjetas de resumen en fila: verde con el número de operativas, amarilla con las que están en mantenimiento y roja con las fuera de servicio; cada una con el número en grande y la etiqueta del estado. Siguen los tres desplegables (Estado, Tipo, Zona), con el botón "Quitar filtros" debajo cuando hay alguno puesto, y la línea que aclara que el resumen cuenta los tres estados del tipo y la zona elegidos. Después, el conteo ("12 máquinas en el inventario" o "5 máquinas con esos filtros") y la cuadrícula de tarjetas en dos columnas (tres en pantallas grandes). Cada tarjeta tiene una franja de color a la izquierda según el estado, el nombre arriba, el código en gris monoespaciado, la insignia de color del estado a la derecha, y abajo "Tipo:" y "Zona:". Las que no están operativas agregan "Retorno estimado:" con la fecha o "Sin fecha estimada". Para el administrador y el entrenador, la tarjeta termina con una franja separada con "Motivo: …" y "Último cambio: Nombre Apellido".

**Cómo se ve a 375 px:** el menú lateral se oculta (comportamiento del Shell del Módulo 0). Las tres tarjetas del resumen se quedan en fila, más chicas, para no empujar los filtros fuera de la pantalla; la etiqueta de estado se parte en dos líneas. Los tres desplegables pasan a ocupar todo el ancho, uno debajo del otro, y las tarjetas quedan en una sola columna.

## Limitación conocida (ajena a H17)

Con el backend apagado del todo, la pantalla no llega a mostrar el error con el botón Reintentar que pide la convención general: el layout del Módulo 0 consulta `GET /auth/me` para saber quién es el usuario y esa llamada no está protegida, así que la ruta responde 500 antes de que la pantalla se dibuje. **No es propio de H17:** `/admin/planes` (H1, ya fusionada) falla igual con el backend abajo. El manejo de error de la pantalla (`ErrorCarga` con Reintentar) sí está puesto y cubre el caso de que falle la consulta de máquinas con la sesión viva. Queda reportado para el Módulo 0.

## Resumen

| Criterio | Casos | Resultado |
|---|---|---|
| 1. Nombre, tipo, zona y estado con colores, y resumen | QA-01 a QA-05, QA-F1 a QA-F3 | Cumple |
| 2. Los filtros se combinan con AND | QA-06 a QA-14, QA-F4 a QA-F10 | Cumple |
| 3. Fecha estimada de retorno o "Sin fecha estimada" | QA-15 a QA-17, QA-F11 a QA-F13 | Cumple |
| 4. "No hay máquinas con esos filtros" | QA-18, QA-F14 | Cumple |
| 5. El miembro no ve datos internos ni puede modificar | QA-19 a QA-23, QA-F15 a QA-F18 | Cumple |

- `npm run test:e2e`: **87/87** (23 de H17 + los existentes).
- `npm test`: **253/253** (incluye las pruebas unitarias de `src/maquinas/`).
- `DB-17.1-prueba-tabla-maquina.sql`: **33/33**, más la migración reversible y el seed idempotente.
- `npm run lint` y `npm run build` del backend: sin errores.
- `npm run lint` del frontend: sin errores.
- Pantalla `/equipo` revisada a **375 px** y **1024 px**, con los cuatro roles.
