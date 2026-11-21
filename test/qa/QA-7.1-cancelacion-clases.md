# H7 / BE-25.1 — Cancelación de clases y avisos

Fecha: 2026-11-20, America/El_Salvador. Rama `feature/H7-completar-cancelacion`, base actual `014468e`, con H25 oficial incorporado y los cambios H7 previos recuperados. **Integración H7/H25 corregida; PostgreSQL real BLOQUEADO.** Se conservaron los cambios existentes de DB-7.1/BE-7.1. Sin staging, commits, push, merges ni cambios de rama durante esta corrección. Frontend sin modificaciones.

## Arquitectura y contrato

Se reutilizan ClaseRepository, la liberación por conteo de H2/H5/H6 y el AvisosClaseService oficial de H25, que delega el envío en AvisosService H22. No se crea un saldo ni un mecanismo adicional de devolución.

`POST /api/v1/clases/:id/cancelar`, solo ADMINISTRADOR. UUID real; cuerpo con `motivo` obligatorio, trim y longitud 10–250 caracteres Unicode. El administrador sale de CurrentUser, nunca del cliente. ValidationPipe rechaza campos adicionales.

```json
{"id":"00000000-0000-4000-8000-000000000010","estado":"CANCELADA_GIMNASIO","reservasCanceladas":3}
```

Respuesta200 explícita; 400 por UUID/cuerpo,401 sin sesión o token inválido,403 en los otros tres roles,404 inexistente,409 iniciada/terminada/ya cancelada. Swagger documenta cuerpo, respuesta y errores.

CancelacionClasesModule conserva sus imports ClasesModule y AvisosModule, se registra en AppModule y solo declara CancelacionClaseService como provider local. El AvisosClaseService se inyecta desde `@Avisos/services` y lo proporciona/exporta exclusivamente AvisosModule. H25 ya separó H24 en AvisosVencimientoModule, por lo que no se introduce un ciclo. No se modificaron AvisosModule, H22/H23 ni el módulo base de clases.

Se eliminaron `src/clases/services/avisos-clase.service.ts` y su spec duplicado. Queda una sola clase AvisosClaseService: `src/avisos/services/avisos-clase.service.ts`. Su implementación, mensajes, repositorio y pruebas unitarias se conservaron byte por byte.

## DB-7.1: migración y reversión

Preparadas manualmente, **NO ejecutadas**:

- `prisma/migrations/20261120220000_h7_cancelacion_clase/migration.sql`
- `prisma/migrations/20261120220000_h7_cancelacion_clase/down.sql`

La migración agrega a clase `motivo_cancelacion VARCHAR(250)`, `cancelada_en TIMESTAMP(3)` y `cancelada_por_id UUID`, todos nullable. FK a usuario con DELETE RESTRICT y UPDATE CASCADE para preservar auditoría. Prisma incorpora canceladaPor y User.clasesCanceladas; se nombró la relación de entrenador existente para distinguir ambas, sin cambiar su FK.

CHECK clase_cancelacion_check: CANCELADA_GIMNASIO exige los tres campos y motivo no vacío de 10–250 caracteres; PROGRAMADA exige los tres NULL. No se debilita el CHECK con NOT VALID.

La migración se detiene si encuentra clases históricas CANCELADA_GIMNASIO: no hay evidencia para inventar fecha, motivo ni administrador. Antes de aplicar, debe autorizarse y prepararse la conciliación de esas filas. No se hizo backfill, no se aplicó migración ni se modificó ninguna base.

La reversión elimina únicamente el CHECK, FK y tres columnas H7, dentro de una transacción, sin CASCADE. Conserva clases, estados, reservas y avisos, pero **pierde la auditoría si no se respalda**. Debe coordinarse con la versión anterior del backend; requiere autorización separada.

H16: índice registro_progreso_medicion_unique NULLS NOT DISTINCT y ambos CHECK conservados. El bloque RegistroProgreso no cambia; no se generaron ni alteraron migraciones previas. El nuevo CHECK H7 tampoco está representado por Prisma y debe preservarse en futuras migraciones.

Antes de usar este cliente Prisma en un despliegue real, DB-7.1 debe estar aplicada en un destino autorizado: prisma generate no crea las columnas.

## Transacción y concurrencia

Una transacción Prisma ReadCommitted:

1. UPDATE condicional de clase por id, estadoPROGRAMADA e inicio>ahora. Toma un bloqueo de fila compatible con el SELECT FOR UPDATE que usa H5. Guarda estado, motivo, fecha y actor en la misma escritura. Solo un cancelador gana.
2. Si count=0, consulta la existencia/estado dentro de la transacción para traducir404/409. No toca reservas ni envía avisos.
3. Bajo el bloqueo ya adquirido, lee los datos actuales de tipo/horario/entrenador para notificar, evitando usar metadatos anteriores a una modificación concurrente H4.
4. Ejecuta UPDATE reserva ... FROM membresia, limitado a esa clase y estadoCONFIRMADA, con cancelada_en. RETURNING entrega id, miembroId y si la membresía histórica es SET_CLASES. Captura y actualización son atómicas: no se reconstruyen destinatarios consultando reservas canceladas después.
5. Retorna las reservas realmente modificadas y metadatos; el servicio espera que $transaction resuelva tras commit. El conteo de respuesta es la longitud del RETURNING.

Las CANCELADA_MIEMBRO previas quedan intactas. Si H6 ganó una actualización durante la carrera, la condición CONFIRMADA se reevalúa y H7 no la cuenta ni la notifica. Si H7 ganó, H6 ya no puede cambiar esa reserva. H5 que llega después del bloqueo relee la clase cancelada y no crea otra reserva. Estas propiedades se derivan del SQL/bloqueos; su ejecución bajo PostgreSQL real sigue pendiente.

Créditos: H2 calcula cantidadClases menos reservas CONFIRMADA. Al cambiar la reserva, el SET recupera disponibilidad sin escribir cantidadClases ni incrementar un saldo. La prueba usa calcularEstadoMembresia real: un SET de 2 con 1 reserva pasa de 1 disponible a 2; MENSUAL permanece con créditos null.

## BE-25.1: envío y deduplicación

H7 consume H25 existente; no vuelve a implementarlo. Después de que ClaseRepository.cancelar resuelve el commit, adapta exclusivamente el RETURNING de reservas:

```ts
const afectados = resultado.reservas.map((r) => ({
  miembroId: r.miembroId,
  devolvioCredito: r.creditoDevuelto,
}));
await this.avisosClaseService.avisarCancelacion(resultado.clase.id, afectados, motivo);
```

No consulta reservas canceladas para reconstruir afectados ni agrega agrupación o deduplicación en H7. El repositorio oficial H25 solo lee metadatos de la clase después del commit. H25 agrupa por texto con/sin crédito y usa H22, ModuloOrigen.CLASES y referencia `clase-{UUID}-cancelada`. Los límites se delegan a H25/H22; H4 limita el cupo de una clase a 50, dentro del máximo de 500 destinatarios de H22. Ya no existe el fraccionamiento adicional del servicio duplicado.

Título: `Clase cancelada: Yoga`. Ejemplo de mensaje:

> La clase de Yoga del 20/11/2026 de 19:00 a 20:00 con Carlos Martínez fue cancelada por el gimnasio. Motivo: El entrenador está incapacitado. Tu reserva quedó cancelada. Tu crédito fue devuelto.

Fecha y horas en UTC−6; el sufijo «Tu crédito fue devuelto.» solo aparece para SET_CLASES de la reserva afectada. Se conserva el formateador oficial, incluido su tratamiento del punto final y recorte del motivo si el mensaje excedería 500 caracteres. H7 no construye ni modifica esos mensajes. Las pruebas oficiales H25 de formato y límites pasan sin cambios.

El envío ocurre después del commit. H25 registra fallos por grupo y continúa los demás; H7 conserva HTTP 200 ante resultados con fallidos o cualquier excepción del notificador. Se probó también una excepción al leer los metadatos de clase en H25: el commit no se revierte ni se presenta como fallida la cancelación. H7 captura esa excepción con Logger sin alterar H25.

H22 mantiene el índice único (miembro_id,referencia) y createMany(skipDuplicates). Repetir el envío interno con la misma captura omite duplicados; repetir el POST devuelve409 sin cancelar ni enviar otra vez. No se añadió un endpoint de reenvío ni una cola de entrega fuera del alcance solicitado.

## Evidencias automatizadas

**58 pruebas H7 en 4 archivos**: DTO, servicio de cancelación, repositorio y HTTP. Se eliminaron las 6 pruebas del notificador duplicado y se agregaron 3 para el contrato oficial/retorno con fallidos/excepción H25. Las pruebas oficiales H25 se reutilizan sin reescribirlas. Los tests HTTP usan módulos/controladores/servicios/repositorios y guards reales, incluido AvisosClaseService oficial; Prisma, verificación JWT y usuarios están simulados. El mutex/copia transaccional modela serialización/rollback; **no demuestra locks, constraints ni rollback reales de PostgreSQL**.

Reproducción antes del ajuste: las aserciones del nuevo contrato fallaban porque H7 enviaba un objeto y motivo en dos argumentos. Tras adaptar a los tres parámetros oficiales, ambas aserciones pasaron. Se comprueban argumentos y afectados exactos, identidad del servicio inyectado por AvisosModule, envío posterior al commit y una sola notificación ante dos canceladores.

| Caso | Resultado local | Evidencia | PostgreSQL |
|---|---|---|---|
|3CONFIRMADA canceladas,1cancelada por miembro intacta|APROBADO|HTTP200exacto, auditoría y reserva previa idéntica|BLOQUEADO|
|SET recupera crédito, Mensual sin devolución|APROBADO|Regla H2 real, RETURNING histórico y mensajes separados|BLOQUEADO|
|Motivo, fecha y actor servidor|APROBADO|Guardia/update repositorio y HTTP con trim|BLOQUEADO|
|Inexistente/iniciada/terminada/ya cancelada|APROBADO|404/409, sin efectos secundarios|BLOQUEADO|
|Motivo9/10/250/251 y Unicode|APROBADO|DTO y HTTP400/200, campos ajenos rechazados|BLOQUEADO|
|Cuatro roles y sin token/inválido|APROBADO|Admin200, otros403, sin sesión401, antes de Prisma|BLOQUEADO|
|Cancelaciones simultáneas|APROBADO en simulación|Una200, otra409,3reservas/3avisos|BLOQUEADO locks reales|
|H6 gana una reserva durante el flujo|APROBADO en simulación|H7devuelve2 y no notifica al miembro que canceló|BLOQUEADO intercalado real|
|Rollback al fallar reservas/commit|APROBADO en simulación|Estado anterior intacto, sin avisos|BLOQUEADO rollback real|
|Avisos solo después del commit|APROBADO|Promesa diferida y secuencia transaccional HTTP|BLOQUEADO commit real|
|Fallo de avisos no revierte cancelación|APROBADO|200,3canceladas, Logger y ambos grupos intentados|BLOQUEADO|
|Reintentos/deduplicación|APROBADO|POST409 y reenvío interno con H22 real/Prisma simulado|BLOQUEADO índice real|
|Contrato y textos oficiales H25|APROBADO|Tres argumentos, afectados exactos, texto oficial y pruebas H25 conservadas|BLOQUEADO persistencia|
|Otras clases y clase sin reservas|APROBADO|Reservas ajenas intactas;200con0 sin enviar|BLOQUEADO|
|CHECK/FK/migración/reversión|REVISADO, NO EJECUTADO|SQL manual y prisma validate; no equivalen a validar constraints|BLOQUEADO|

Regresión final: suite completa **1104 pruebas / 98 archivos** aprobada. La suite dirigida de clases, reservas, avisos, membresías y HTTP H7 aprobó **319 pruebas / 27 archivos**. Incluye H4/H5/H6/H7/H22/H23/H25 y el cálculo de créditos. La selección del servicio de cancelación, HTTP H7, servicio oficial H25 y AvisosModule pasó **53 pruebas / 4 archivos**. Los conteos sustituyen la verificación anterior a incorporar H25, que era 1096/98 con un notificador duplicado.

Los fixtures e2e previos de reservas/ocupación/asistencia se conservan con la compatibilidad DB-7.1 ya preparada. No se ejecutaron esos e2e porque escriben en la base.

### Adaptación de QA-25.1

`test/avisos-cancelacion-clase.e2e-spec.ts` deja de modificar directamente el estado de la clase sin auditoría. QA-C01 llama al endpoint real H7 como un administrador de prueba propio. Un spy que conserva la implementación captura los argumentos y el resultado real de H25; QA-C02 comprueba el primer envío de dos avisos sin provocar un segundo envío artificial.

Se mantienen QA-C01/C02/C03/C04/C05/C06/C08, incluidos mensajes oficiales, exclusión de no afectados, bandeja y contador H23, crédito SET y reintento sin duplicados. Se añade QA-C07: auditoría DB-7.1, reserva previamente cancelada intacta y segundo POST 409 sin nuevos avisos. La limpieza se limita a los UUID de fixtures y omite filtros con UUID undefined si falla la preparación.

Los ocho casos e2e están **PREPARADOS, NO EJECUTADOS** contra PostgreSQL. Se verificaron sintaxis y tipos de ese archivo sin ejecutar sus hooks ni conectarse a BD. El informe original de QA-25.1 del compañero no se modifica ni se interpreta como evidencia de una ejecución local nueva.

Verificaciones ejecutadas:

```powershell
npx.cmd prisma validate
npm.cmd run prisma:generate
npm.cmd run build
npm.cmd run lint
npm.cmd test
git diff --check
git status --short
```

Prisma válido, cliente 7.10.0 generado, build aprobado. Lint aprobado con solo 2 advertencias previas de accesos: cierre-automatico.service.spec.ts:29 (unbound-method) y qa-accesos.e2e-spec.ts:234 (sort). Vitest conserva el aviso previo de vite-tsconfig-paths. No se aplicaron migraciones ni se ejecutó ningún comando de seed/reset/db push.

## Integración real bloqueada y procedimiento preparado

Configuración revisada sin mostrar credenciales: únicamente `.env` con `localhost:5432/si_be_boilerplate` y `NODE_ENV=development`. No hay destino QA explícito autorizado. No se abrió conexión PostgreSQL ni se ejecutaron migraciones, seed, reset, SQL, API real o e2e que escriben.

Preparados h7-preflight.sql exclusivamente de lectura y h7-integracion.http con POST/GET para ejecución posterior. No se ejecutaron.

1. Obtener autorización y confirmar base QA exclusiva. Revisar migraciones y objetos H16/H22 con el preflight; no arrancar comandos Docker/API que migren automáticamente.
2. Resolver clases canceladas históricas antes de autorizar DB-7.1. Respaldar auditoría para cualquier reversión. Aplicación/reversión requieren permiso separado.
3. Preparar manifiesto UUID de clase futura, administrador,4miembros/membresías y reservas:3CONFIRMADA(2SET,1MENSUAL),1CANCELADA_MIEMBRO con fecha previa. No sembrar ni limpiar por rangos genéricos.
4. Ejecutar el POST con autenticación real. Contrastar respuesta200/count3, auditoría y reservas en SQL; verificar créditos mediante membresias/mia y bandeja H23 con los miembros afectados. La reserva previa no cambia ni recibe aviso.
5. Lanzar2POST simultáneos sobre una nueva clase:1éxito/1conflicto, un solo cambio de auditoría y avisos únicos. Probar además H5 antes/después del bloqueo y carrera H6 antes/después del UPDATE de reservas con dos conexiones y barreras controladas.
6. Probar errores de transacción/commit y fallo H22 en el harness QA sin modificar producción: rollback antes del commit,200persistido ante fallo posterior y reintento interno con la captura sin duplicados.
7. Verificar CHECK/FK con escrituras aisladas dentro de transacciones de prueba autorizadas; comprobar que down.sql elimina solo los objetos H7 y respaldar/restaurar auditoría. No declarar la revisión estática como reversión probada.
8. Limpiar solo los UUID del manifiesto en orden de FK, abortando si hay referencias ajenas; nunca TRUNCATE/reset ni borrar tablas/volúmenes. Comparar H16 antes/después.

## Archivos

Modificados en esta corrección: src/clases/cancelacion-clases.module.ts, src/clases/services/cancelacion-clase.service.ts y su spec, test/qa/h7-http.spec.ts, test/avisos-cancelacion-clase.e2e-spec.ts y este informe. Registro privado actualizado en docs/ESTADO_CODEX.md, ignorado.

Eliminados: src/clases/services/avisos-clase.service.ts y src/clases/services/avisos-clase.service.spec.ts.

Preservados respecto al inicio de esta corrección, comprobados con SHA-256: schema.prisma, migración/down DB-7.1, migración manual H16, ClaseRepository.cancelar, controlador y DTO H7, servicio/spec/repositorio H25, AvisosModule y AvisosService H22. Se conservan además los cambios H7 recuperados en AppModule, barrels y fixtures anteriores. No se modifican frontend ni membresías.

**Veredicto: integración con H25 oficial y QA local aprobadas; PostgreSQL real BLOQUEADO.**
