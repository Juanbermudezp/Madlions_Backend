# QA-30.1. Pruebas de roles, autenticación y autorización (Módulo 0)

**Historia:** H30. Backend del Módulo 0
**Responsable:** <tu nombre completo>
**Fecha de ejecución:** <fecha>
**Entorno:** API local (`npm run start:dev`, puerto 8000), PostgreSQL 18 del docker-compose, datos de `npm run db:seed`.

## Usuarios de prueba (contraseña `Demo1234!`)

| Rol | Correo |
|---|---|
| MIEMBRO | miembro@madlions.com |
| ENTRENADOR | entrenador@madlions.com |
| ENTRENADOR | entrenador2@madlions.com |
| RECEPCION | recepcion@madlions.com |
| ADMINISTRADOR | admin@madlions.com |
| MIEMBRO inactivo | inactivo@madlions.com |

## Casos de prueba

### Autenticación

| ID | Caso | Pasos | Esperado | Resultado |
|---|---|---|---|---|
| QA-01 | Acceso con token válido | Login con entrenador, Authorize, `GET /auth/me` | 200 | |
| QA-02 | Petición sin token | `GET /auth/me` sin Authorize | 401 | |
| QA-03 | Token inválido | Authorize con el token cambiando su último carácter, `GET /auth/me` | 401 | |
| QA-04 | Token expirado | Prueba unitaria `jwt-auth.guard.spec.ts` ("token inválido o expiró") | 401 | |
| QA-05 | Expiración de 8 horas | Login con entrenador | `expiresIn: 28800` | |
| QA-06 | Usuario desactivado | Login con inactivo@madlions.com | 401 sin token | |

### Autorización

| ID | Caso | Pasos | Esperado | Resultado |
|---|---|---|---|---|
| QA-07 | Permisos por rol | Prueba unitaria `roles.guard.spec.ts`: ENTRENADOR pasa; MIEMBRO, RECEPCION y ADMINISTRADOR no | Pasa / 403 | |
| QA-08 | Rol sin autorización | Prueba unitaria `roles.guard.spec.ts` | 403 | |
| QA-09 | Recurso de otro usuario | Prueba unitaria `assert-ownership.spec.ts` | 403 | |
| QA-10 | Elevar el rol en el registro | `POST /users` con `"rol": "ADMINISTRADOR"` en el cuerpo | 400, no se crea | |
| QA-11 | Rol alterado en el token | Prueba unitaria `jwt-auth.guard.spec.ts`: el rol se toma de la base, no del token. Alterar el token invalida la firma (QA-03) | Rol de la base | |

> QA-07 a QA-09 se verifican de forma funcional en las historias que usan `@Roles` y `assertOwnership` (por ejemplo H8).

### Datos

| ID | Caso | Pasos | Esperado | Resultado |
|---|---|---|---|---|
| QA-12 | Datos de `/auth/me` | `GET /auth/me` con entrenador | `id, correo, nombre, apellido, rol` | |
| QA-13 | Una ficha por usuario | SQL 1 | Error de unicidad | |
| QA-14 | Documento repetido | SQL 2 | Error de unicidad | |
| QA-15 | Código de miembro repetido | SQL 3 | Error de unicidad | |
| QA-16 | Formato de teléfono y nombre | SQL 4 y 5 | Error de CHECK | |
| QA-17 | Códigos generados | SQL 6 | `MBR-000001`, `MBR-000002`, ... | |

Consultas, ejecutadas en `docker compose exec postgres psql -U postgres -d si_be_boilerplate`:

```sql
-- 1. Segunda ficha para el mismo usuario
INSERT INTO miembro (id, usuario_id, documento, codigo_miembro)
SELECT gen_random_uuid(), id, '09999999-9', 'MBR-999999' FROM usuario WHERE email = 'miembro@madlions.com';

-- 2. Documento repetido
INSERT INTO miembro (id, usuario_id, documento, codigo_miembro)
SELECT gen_random_uuid(), id, '01234567-8', 'MBR-999999' FROM usuario WHERE email = 'admin@madlions.com';

-- 3. Código repetido
INSERT INTO miembro (id, usuario_id, documento, codigo_miembro)
SELECT gen_random_uuid(), id, '09999999-9', 'MBR-000001' FROM usuario WHERE email = 'admin@madlions.com';

-- 4. Teléfono inválido
UPDATE usuario SET telefono = '123' WHERE email = 'demo@example.com';

-- 5. Nombre de 1 carácter
UPDATE usuario SET nombre = 'A' WHERE email = 'demo@example.com';

-- 6. Códigos generados
SELECT u.email, m.documento, m.codigo_miembro
FROM miembro m JOIN usuario u ON u.id = m.usuario_id ORDER BY m.codigo_miembro;
```

## Resultado general

<Ej.: 17 de 17 casos pasan. Sin defectos encontrados.>

## Evidencia

Pruebas unitarias (`npm test`): 7 archivos, 24 pruebas, todas pasan.

![Resultado de npm test](![alt text](image-1.png))