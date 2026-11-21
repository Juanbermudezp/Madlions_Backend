# Despliegue

## Dónde está desplegado

| Componente | Plataforma | URL | Rama |
|---|---|---|---|
| Frontend | Vercel (plan Hobby) | https://madlions-frontend.vercel.app | main |
| Backend | Render (Web Service, plan Free, región Virginia) | https://madlions-backend.onrender.com | main |
| Documentación de la API | Render (Swagger del backend) | https://madlions-backend.onrender.com/api/docs | main |
| Base de datos | Neon (PostgreSQL 17, AWS US East 1) | (privada) | |

En el plan gratuito de Render el backend se apaga después de unos minutos sin uso; la primera petición tarda unos 50 segundos mientras arranca.

## Configuración de cada plataforma

### Render (backend)

| Campo | Valor |
|---|---|
| Runtime | Node |
| Build Command | `npm ci --include=dev && npm run build` |
| Start Command | `npx prisma migrate deploy && npm run start:prod` |
| Health Check Path | `/api/v1` |
| Auto-Deploy | Al hacer commit en la rama configurada |

Las migraciones pendientes se aplican en cada arranque con `prisma migrate deploy`, antes de levantar la API.

### Vercel (frontend)

Proyecto Next.js con la configuración por defecto (Root Directory `./`). Cada push a `main` genera un despliegue de producción; los demás pushes generan despliegues de vista previa.

### Neon (base de datos)

Base `neondb`, rama `production`. Se usa la cadena de conexión directa (sin pooler) con `sslmode=require`, porque `prisma migrate deploy` necesita una conexión directa.

## Cómo se publica una nueva versión

1. Con las historias fusionadas en `develop`, se crea `release/X.Y.Z` desde `develop` y se actualiza la versión con `npm version X.Y.Z --no-git-tag-version` (commit `chore: actualiza la version a X.Y.Z`).
2. PR de `release/X.Y.Z` hacia `main`, aprobado por otro integrante y fusionado con merge commit. La misma rama se fusiona de vuelta a `develop`.
3. En GitHub se crea la Release `vX.Y.Z` sobre `main`, con la lista de historias incluidas, en los dos repositorios.
4. Render y Vercel despliegan `main` automáticamente al recibir el merge.
5. Si se necesitan datos semilla nuevos en producción, se corre desde una máquina del equipo:
   ```powershell
   $env:DATABASE_URL="<cadena de Neon>"
   $env:SEED_PASSWORD="<contraseña de los usuarios de prueba>"
   npm run db:seed
   ```
6. Un defecto en producción se corrige con `hotfix/<descripcion>` desde `main`, que se fusiona a `main` y a `develop`, y sube la versión de parche (v1.0.1).

## Variables de entorno en producción

| Variable | Dónde se configura |
|---|---|
| `NODE_ENV` | Render → madlions-backend → Environment |
| `DATABASE_URL` | Render → madlions-backend → Environment |
| `JWT_SECRET` | Render → madlions-backend → Environment |
| `JWT_EXPIRES_IN` | Render → madlions-backend → Environment |
| `REFRESH_TOKEN_EXPIRES_IN_DAYS` | Render → madlions-backend → Environment |
| `BCRYPT_SALT_ROUNDS` | Render → madlions-backend → Environment |
| `FRONTEND_URL` | Render → madlions-backend → Environment |
| `PORT` | La asigna Render automáticamente |
| `API_URL` | Vercel → madlions-frontend → Settings → Environment Variables |
| `SEED_PASSWORD` | Solo en la terminal de quien corre el seed; no se guarda en ninguna plataforma |

El repositorio no contiene contraseñas ni secretos: solo `.env.example` con los nombres de las variables.
