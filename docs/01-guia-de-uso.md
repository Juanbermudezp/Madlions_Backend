# Guía de uso

Sistema: https://madlions-frontend.vercel.app. Cada usuario tiene un solo rol y, al iniciar sesión, entra al área de su rol (`/miembro`, `/entrenador`, `/recepcion` o `/admin`). Las credenciales de prueba se entregan en Moodle.

## Roles

| Rol | Qué puede hacer |
|---|---|
| Miembro | Consulta su membresía y sus créditos, reserva y cancela clases, agenda sesiones con un entrenador, paga cobros y descarga comprobantes, ve sus rutinas, registra su progreso, califica clases y sesiones que tomó, y recibe avisos. |
| Entrenador | Define sus horarios disponibles, ve sus clases y sesiones, registra asistencia, crea y asigna rutinas, ve el progreso de sus miembros y cambia el estado de las máquinas. |
| Recepción | Registra compras y renovaciones de membresía, registra el ingreso y la salida de los miembros (con alerta de membresía vencida) y consulta las clases. |
| Administrador | Define planes, tipos de clase y clases con su cupo y horario, cancela clases, consulta cobros pendientes, gestiona el estado de las máquinas, ve calificaciones y los reportes de ocupación, ingresos, renovación y desempeño de entrenadores. |

## Flujos principales

Cada flujo indica el rol con el que se entra y la opción del menú lateral.

### Módulo 1: Membresías y planes

#### Definir un plan (Administrador)

1. Entrar como administrador y abrir **Planes**.
2. Crear un plan: nombre, tipo (Daypass, Mensual o Set de clases), precio, cantidad de clases (solo en Set de clases), beneficios y tipos de clase incluidos.
3. Guardar. El plan aparece en la lista y queda disponible para la venta; se puede editar o desactivar.

#### Registrar la compra o renovación de una membresía (Recepción)

1. Entrar como recepción y abrir **Compras y renovaciones**.
2. Buscar al miembro por nombre, código o documento.
3. Elegir el plan y la fecha de inicio (desde hoy hasta 30 días después; en una renovación queda fija al día siguiente del vencimiento) y registrar.
4. Se genera el cobro pendiente que el miembro paga desde su cuenta (Módulo 5).

#### Consultar mi membresía (Miembro)

1. Entrar como miembro y abrir **Mi membresía**.
2. Ver el plan, el estado (vigente, próxima a vencer, vencida o pendiente de pago), la fecha de vencimiento y, en un set de clases, los créditos disponibles.

### Módulo 2: Reserva de clases grupales

#### Programar una clase (Administrador)

1. Abrir **Tipos de clase** y crear los tipos que hagan falta (Spinning, Yoga...).
2. Abrir **Clases**, elegir tipo, entrenador, horario y cupo máximo (1 a 50) y guardar. El sistema rechaza traslapes con otras clases o sesiones del entrenador.
3. Para cancelar una clase antes de su inicio, abrirla y escribir el motivo: los miembros con reserva reciben un aviso (H25).

#### Reservar y cancelar un cupo (Miembro)

1. Abrir **Clases de la semana**: cada clase muestra los lugares disponibles.
2. Reservar un cupo. La reserva aparece en **Mis reservas** y, en un set de clases, consume un crédito.
3. Para cancelar, abrir **Mis reservas** y cancelar (hasta 2 horas antes del inicio); el cupo y el crédito se liberan.

### Módulo 3: Agenda de entrenadores personales

#### Definir horarios disponibles (Entrenador)

1. Entrar como entrenador y abrir **Mis horarios**.
2. Agregar bloques de disponibilidad (fecha, hora de inicio y duración). Un bloque libre se puede eliminar.

#### Agendar una sesión (Miembro)

1. Abrir **Sesiones personales** y elegir un entrenador.
2. Escoger uno de sus horarios disponibles y confirmar. El bloque queda ocupado y se genera el cobro de la sesión.

### Módulo 4: Check-in / control de acceso

#### Registrar el ingreso y la salida de un miembro (Recepción)

1. Abrir **Control de acceso** y buscar al miembro.
2. Registrar el ingreso. Si la membresía no está al día, el sistema muestra la alerta y pide un motivo para dejarlo pasar.
3. Al salir, registrar la salida desde la lista de ingresos del día.

### Módulo 5: Pagos y facturación

#### Pagar un cobro y ver el comprobante (Miembro)

1. Abrir **Mis pagos**: aparecen los cobros pendientes y pagados.
2. Pagar un cobro con la pasarela simulada (datos de tarjeta de prueba).
3. Si se aprueba, se genera el comprobante con subtotal, IVA (13 %) y total.

#### Consultar cobros pendientes (Administrador)

1. Abrir **Cobros pendientes** y filtrar por miembro o concepto.

### Módulo 6: Planes de entrenamiento y progreso

#### Crear y asignar una rutina (Entrenador)

1. Abrir **Rutinas** y crear una rutina: miembro, nombre, objetivo, fecha de inicio y los días con sus ejercicios (series, repeticiones y descanso).
2. Guardar. El miembro la ve en **Mis rutinas**.
3. En **Miembros** el entrenador puede ver, sin modificar, el progreso de los miembros a quienes asignó rutinas.

#### Registrar mi progreso (Miembro)

1. Abrir **Mi progreso** y registrar una medida (peso, cintura, cadera...) o una marca de un ejercicio.
2. Ver la evolución respecto al punto de partida.

### Módulo 7: Control de equipo y máquinas

#### Consultar el estado de las máquinas (todos los roles)

1. Abrir **Estado del equipo**: cada máquina muestra su estado (operativa, en mantenimiento o fuera de servicio) y su zona.

#### Registrar mantenimiento y retorno (Administrador o Entrenador)

1. En **Estado del equipo**, abrir una máquina y cambiar su estado con el motivo y, si aplica, la fecha estimada de retorno.
2. El cambio queda en el historial de la máquina.

### Módulo 8: Reseñas y calificaciones

#### Registrar asistencia (Entrenador)

1. Abrir **Asistencia** y marcar a cada miembro de la clase o sesión como "Asistió" o "No asistió".

#### Calificar una clase o sesión (Miembro)

1. Abrir **Pendientes de calificar**: solo aparecen las clases y sesiones a las que el miembro asistió.
2. Calificar actividad, entrenador e instalaciones (1 a 5) y, opcionalmente, dejar un comentario.

#### Ver los promedios (Administrador)

1. Abrir **Calificaciones** para ver el promedio por entrenador y por tipo de clase.

### Módulo 9: Notificaciones

#### Ver mis avisos (Miembro)

1. Abrir **Avisos** (el ícono del menú muestra el contador de no leídos).
2. La bandeja lista los avisos del más reciente al más antiguo; los no leídos van en negrita.
3. Abrir un aviso para ver el mensaje completo; pasa a "Leído".
4. Usar "Marcar todos como leídos" o el filtro "No leídos" según se necesite.

### Módulo 10: Reportes y analítica

#### Consultar los reportes (Administrador)

1. Abrir **Reportes** y elegir el reporte: ocupación de clases, ingresos, renovación y cancelación de membresías, o desempeño de entrenadores.
2. Elegir el periodo. Los reportes de ingresos se pueden exportar a PDF.
3. El entrenador ve su propio desempeño en **Mi desempeño**.

## Capturas de los flujos

Para tener una mejor visualización del flujo, revisar el siguiente enlace: [MADLIONS](https://ucaedusv-my.sharepoint.com/:f:/g/personal/00379422_uca_edu_sv/IgCXFUgEtu22RKV9xk28BcE0AUaGOEbMjhyF-VlmEiiUHUk?e=Eum0Nu)
