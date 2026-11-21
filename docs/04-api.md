# API

**Documentación interactiva (Swagger):** https://madlions-backend.onrender.com/api/docs

Todas las rutas van bajo el prefijo `/api/v1`. Las respuestas y los cuerpos son JSON. Los datos de entrada se validan con `class-validator`: un campo de más o con formato inválido responde `400`.

## Autenticación

1. `POST /api/v1/auth/login` con `{ "email": "...", "password": "..." }` devuelve un **access token** (JWT) y un **refresh token**.
2. El access token se envía en cada petición en el encabezado `Authorization: Bearer <token>`. Dura `JWT_EXPIRES_IN` (8 horas en producción).
3. Cuando vence, `POST /api/v1/auth/refresh` con el refresh token entrega un par nuevo. El refresh token dura `REFRESH_TOKEN_EXPIRES_IN_DAYS` (7 días) y se guarda como hash en la base.
4. `POST /api/v1/auth/logout` con el refresh token lo revoca (cierra la sesión).

Todas las rutas están cerradas por defecto (guard global `JwtAuthGuard`). Además del token, cada endpoint valida el **rol** del usuario; un rol sin permiso recibe `403`. En el frontend, el token se guarda en una cookie `httpOnly` y la API se llama desde el servidor de Next.js.

## Endpoints por módulo

### Módulo 0: Autenticación y usuarios

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | /api/v1 | Health check | Público |
| POST | /api/v1/auth/login | Inicia sesión y devuelve los tokens | Público |
| POST | /api/v1/auth/refresh | Renueva el access token | Público (con refresh token) |
| POST | /api/v1/auth/logout | Cierra la sesión revocando el refresh token | Público (con refresh token) |
| GET | /api/v1/auth/me | Datos del usuario autenticado y su rol | Autenticado |
| POST | /api/v1/users | Registro de una cuenta | Público |

<!-- Roles: revisen el decorador de roles de cada controlador y corrijan si alguno no coincide. -->

### Módulo 1: Membresías y planes

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | /api/v1/planes | Lista los planes | ADMINISTRADOR, RECEPCION |
| POST | /api/v1/planes | Crea un plan | ADMINISTRADOR |
| PATCH | /api/v1/planes/:id | Edita un plan | ADMINISTRADOR |
| PATCH | /api/v1/planes/:id/desactivar | Desactiva un plan | ADMINISTRADOR |
| GET | /api/v1/configuracion/precio-clase-puntual | Consulta el precio de la clase puntual | ADMINISTRADOR |
| PUT | /api/v1/configuracion/precio-clase-puntual | Cambia el precio de la clase puntual | ADMINISTRADOR |
| POST | /api/v1/membresias | Registra la compra o renovación de una membresía | RECEPCION |
| GET | /api/v1/membresias/resumen | Resumen de la membresía de un miembro | RECEPCION |
| GET | /api/v1/membresias/:id | Detalle de una membresía | RECEPCION, ADMINISTRADOR |
| GET | /api/v1/membresias/mia | Estado de mi membresía y mis créditos | MIEMBRO |
| GET | /api/v1/miembros/buscar | Busca miembros por nombre, código o documento | RECEPCION, ENTRENADOR |

### Módulo 2: Reserva de clases grupales

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | /api/v1/tipos-clase | Lista los tipos de clase | ADMINISTRADOR |
| POST | /api/v1/tipos-clase | Crea un tipo de clase | ADMINISTRADOR |
| PATCH | /api/v1/tipos-clase/:id | Edita un tipo de clase | ADMINISTRADOR |
| GET | /api/v1/clases | Agenda de clases programadas | ADMINISTRADOR, RECEPCION |
| POST | /api/v1/clases | Programa una clase (horario, entrenador, cupo) | ADMINISTRADOR |
| PATCH | /api/v1/clases/:id | Edita o cancela una clase (con motivo) | ADMINISTRADOR |
| GET | /api/v1/clases/entrenadores | Entrenadores que pueden impartir clases | ADMINISTRADOR |
| GET | /api/v1/clases/mias | Clases que imparte el entrenador autenticado | ENTRENADOR |
| GET | /api/v1/clases/reservables | Clases de la semana con cupos disponibles | MIEMBRO |
| GET | /api/v1/reservas/mias | Mis reservas | MIEMBRO |
| POST | /api/v1/reservas | Reserva un cupo | MIEMBRO |
| POST | /api/v1/reservas/:id/cancelar | Cancela mi reserva (hasta 2 horas antes) | MIEMBRO |

### Módulo 3: Agenda de entrenadores personales

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | /api/v1/bloques/mios | Mis horarios disponibles | ENTRENADOR |
| POST | /api/v1/bloques | Crea un bloque de disponibilidad | ENTRENADOR |
| DELETE | /api/v1/bloques/:id | Elimina un bloque libre | ENTRENADOR |
| GET | /api/v1/entrenadores | Lista los entrenadores | MIEMBRO |
| GET | /api/v1/entrenadores/:id/bloques | Horarios disponibles de un entrenador | MIEMBRO |
| POST | /api/v1/sesiones | Agenda una sesión personal en un bloque | MIEMBRO |
| GET | /api/v1/sesiones/mias | Mis sesiones personales | MIEMBRO, ENTRENADOR |

### Módulo 4: Check-in / control de acceso

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| POST | /api/v1/accesos/ingreso | Registra el ingreso de un miembro (con alerta de membresía vencida) | RECEPCION |
| POST | /api/v1/accesos/:id/salida | Registra la salida | RECEPCION |
| GET | /api/v1/accesos/hoy | Ingresos del día | RECEPCION |

### Módulo 5: Pagos y facturación

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | /api/v1/cobros/mios | Mis cobros pendientes y pagados | MIEMBRO |
| POST | /api/v1/cobros/:id/pagar | Paga un cobro con la pasarela simulada | MIEMBRO |
| GET | /api/v1/comprobantes/:numero | Comprobante de un pago | MIEMBRO |
| GET | /api/v1/cobros | Cobros pendientes de todos los miembros | ADMINISTRADOR |

### Módulo 6: Planes de entrenamiento y progreso

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| POST | /api/v1/rutinas | Crea y asigna una rutina | ENTRENADOR |
| GET | /api/v1/rutinas/creadas-por-mi | Rutinas que creé | ENTRENADOR |
| PUT | /api/v1/rutinas/:id | Edita una rutina | ENTRENADOR |
| GET | /api/v1/rutinas/mias | Mis rutinas asignadas | MIEMBRO |
| GET | /api/v1/rutinas/:id | Detalle de una rutina | MIEMBRO, ENTRENADOR |
| POST | /api/v1/progreso | Registra una medida o marca | MIEMBRO |
| PATCH | /api/v1/progreso/:id | Corrige un registro de progreso | MIEMBRO |
| GET | /api/v1/progreso/mio | Mi evolución | MIEMBRO |
| GET | /api/v1/miembros/:id/progreso | Progreso de un miembro con rutina asignada (solo lectura) | ENTRENADOR |

### Módulo 7: Control de equipo y máquinas

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | /api/v1/maquinas | Estado de las máquinas (el motivo solo para personal) | Todos |
| POST | /api/v1/maquinas/:id/estado | Cambia el estado de una máquina | ADMINISTRADOR, ENTRENADOR |
| GET | /api/v1/maquinas/:id/historial | Historial de cambios de una máquina | ADMINISTRADOR, ENTRENADOR |

### Módulo 8: Reseñas y calificaciones

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | /api/v1/asistencia/pendientes | Clases y sesiones con asistencia por registrar | ENTRENADOR |
| PUT | /api/v1/asistencia | Registra asistencia (Asistió / No asistió) | ENTRENADOR |
| GET | /api/v1/resenas/pendientes | Clases y sesiones que puedo calificar | MIEMBRO |
| POST | /api/v1/resenas | Califica una clase o sesión tomada | MIEMBRO |
| GET | /api/v1/estadisticas/calificaciones | Promedio por entrenador y por tipo de clase | ADMINISTRADOR |

### Módulo 9: Notificaciones (avisos)

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | /api/v1/avisos/mios?soloNoLeidos=false&pagina=1 | Bandeja de avisos del miembro autenticado, 20 por página | MIEMBRO |
| GET | /api/v1/avisos/no-leidos/conteo | Contador de avisos no leídos | MIEMBRO |
| GET | /api/v1/avisos/:id | Detalle de un aviso; lo marca como leído | MIEMBRO |
| POST | /api/v1/avisos/marcar-todos-leidos | Marca todos mis avisos como leídos | MIEMBRO |

No hay endpoint para crear avisos: los registra el servicio de avisos (H22) desde otros módulos (cancelación de clase, H25) y desde una tarea programada diaria a las 6:00 (vencimiento de membresía, H24).

### Módulo 10: Reportes y analítica

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | /api/v1/reportes/ocupacion | Ocupación de clases grupales | ADMINISTRADOR |
| GET | /api/v1/reportes/ingresos | Ingresos por periodo | ADMINISTRADOR |
| GET | /api/v1/reportes/ingresos/detalle | Detalle de los ingresos | ADMINISTRADOR |
| GET | /api/v1/reportes/renovacion | Tasa de renovación y cancelación de membresías | ADMINISTRADOR |
| GET | /api/v1/reportes/desempeno | Desempeño de entrenadores (el entrenador ve el suyo) | ADMINISTRADOR, ENTRENADOR |
