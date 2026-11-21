# Instalación local

## Requisitos

- Docker y Docker Compose v2 o superior
- Node.js 22 o 24 (Prisma 7 requiere `^20.19 || ^22.12 || >=24`)
- npm
- Git

## Backend (`Madlions_Backend`)

1. Clonar el repositorio:
   ```bash
   git clone https://github.com/Juanbermudezp/Madlions_Backend.git
   cd Madlions_Backend
   ```
2. Copiar el archivo de variables y completar los valores (al menos `JWT_SECRET`):
   ```bash
   cp .env.example .env
   ```
3. Levantar PostgreSQL con Docker:
   ```bash
   docker compose up -d postgres
   ```
   (Con `docker compose up -d` se levanta también la API dentro de Docker; las migraciones se aplican al arrancar el contenedor.)
4. Instalar dependencias y aplicar las migraciones:
   ```bash
   npm ci
   npx prisma migrate deploy
   ```
5. Cargar los datos semilla (usuarios de cada rol, tipos de clase, clases, membresías y máquinas de prueba). Se puede correr varias veces sin duplicar datos:
   ```bash
   npm run db:seed
   ```
   Si `SEED_PASSWORD` no está definida, los usuarios de prueba quedan con la contraseña `Demo1234!` (solo para local).
6. Levantar la API en modo desarrollo:
   ```bash
   npm run start:dev
   ```
7. Abrir http://localhost:<PORT>/api/docs (el puerto lo define `PORT` en `.env`).

## Frontend (`Madlions_Frontend`)

1. Clonar e instalar:
   ```bash
   git clone https://github.com/Juanbermudezp/Madlions_Frontend.git
   cd Madlions_Frontend
   npm ci
   ```
2. Copiar `.env.example` a `.env` y apuntar `API_URL` al backend local, con el prefijo `/api/v1`.
3. Levantar:
   ```bash
   npm run dev
   ```
4. Abrir http://localhost:3000 (o el puerto que indique Next si el 3000 está ocupado por la API).

## Variables de entorno

### Backend

| Variable | Descripción | Ejemplo |
|---|---|---|
| `NODE_ENV` | Entorno de ejecución | `development` |
| `PORT` | Puerto HTTP de la API | `8000` |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT` | Datos con que docker-compose crea el contenedor de PostgreSQL | `postgres` / `postgres` / `si_be_boilerplate` / `5432` |
| `DATABASE_URL` | Cadena de conexión a PostgreSQL (obligatoria) | `postgresql://postgres:postgres@localhost:5432/si_be_boilerplate?schema=public` |
| `JWT_SECRET` | Secreto para firmar los JWT, mínimo 32 caracteres (obligatoria) | `openssl rand -base64 32` |
| `JWT_EXPIRES_IN` | Duración del access token | `8h` |
| `REFRESH_TOKEN_EXPIRES_IN_DAYS` | Duración del refresh token en días | `7` |
| `BCRYPT_SALT_ROUNDS` | Costo de bcrypt | `12` |
| `FRONTEND_URL` | Orígenes permitidos por CORS, separados por coma | `http://localhost:3000` |
| `SEED_PASSWORD` | Contraseña de los usuarios del seed (vacía = `Demo1234!`) | |

### Frontend

| Variable | Descripción | Ejemplo |
|---|---|---|
| `API_URL` | URL base de la API, con el prefijo de versión. La usa el servidor de Next. | `http://localhost:8000/api/v1` |

## Pruebas automatizadas

Backend:

```bash
npm test            # pruebas unitarias (*.spec.ts junto al código en src/)
npm run test:e2e    # pruebas e2e (test/*.e2e-spec.ts), necesitan la base levantada
```

Frontend:

```bash
npm test            # pruebas con Vitest y Testing Library (tests/*.test.ts y *.test.tsx)
```

El material de QA de cada historia (casos, datos esperados y scripts de apoyo) está en `docs/qa/` y `test/qa/` del backend.
