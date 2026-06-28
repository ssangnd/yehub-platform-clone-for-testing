# YeHub Platform

Monorepo for the YeHub platform. Four packages cover the API, the main web app, a demo/showcase app, and end-to-end tests.

| Directory     | Description       | Stack                                                                |
| ------------- | ----------------- | -------------------------------------------------------------------- |
| `yehub-be/`   | Backend API       | NestJS 11, Prisma 7, PostgreSQL 17, Redis 7, BullMQ                  |
| `yehub-fe/`   | Main web app      | React 19, Vite, Tailwind CSS v4, shadcn/ui, TanStack Query v5        |
| `yehub-demo/` | Demo/showcase app | Same as `yehub-fe` plus i18n (`react-i18next`) and MSW v2 mocking    |
| `yehub-e2e/`  | E2E tests         | Playwright (Chromium)                                                |

The backend exposes a versioned REST API (`/v1/...`) with JWT auth (5m access + 7d refresh), session-tracked logins, BullMQ-backed queues, S3-compatible uploads, and SMTP email. Each package has its own `CLAUDE.md` with deeper conventions — read it before working in that package.

## Prerequisites

- Node.js 20+
- pnpm (this repo uses **pnpm** — not npm or yarn)
- Docker + Docker Compose

## Quick Start

### 1. Start infrastructure

From the repo root:

```bash
docker compose up -d
```

This brings up:

| Service   | URL / Port                     |
| --------- | ------------------------------ |
| Postgres  | `localhost:5432` (db `yehub`)  |
| Redis     | `localhost:6379`               |
| MinIO     | API `:9000`, console `:9001`   |
| smtp4dev  | UI `http://localhost:5555`     |

Postgres and Redis credentials default to `postgres`/`postgres` and no auth respectively. MinIO defaults to `minioadmin`/`minioadmin` with a pre-created `yehub` bucket.

### 2. Backend (`yehub-be/`)

```bash
cd yehub-be
pnpm install
cp .env.example .env
pnpm prisma:migrate          # apply migrations
pnpm prisma:generate         # generate Prisma client
pnpm prisma:seed             # seed database
pnpm start:dev               # http://localhost:3000
```

Swagger docs: `http://localhost:3000/api/docs`.

### 3. Frontend (`yehub-fe/`)

```bash
cd yehub-fe
pnpm install
pnpm dev                     # http://localhost:5173
```

The frontend reads `VITE_API_URL` (defaults to `http://localhost:3000/v1`).

### 4. E2E tests (`yehub-e2e/`)

```bash
cd yehub-e2e
npm test                     # auto-starts services via Docker Compose
npm run test:headed          # visible browser
npm run test:ui              # Playwright UI mode
```

## Common Commands

### Backend

```bash
pnpm start:dev               # watch-mode dev server
pnpm build                   # compile TypeScript
pnpm test                    # Jest unit tests
pnpm lint                    # ESLint with auto-fix
pnpm prisma:migrate --name <name>   # create a new migration
pnpm prisma:studio           # GUI for the database
```

### Frontend

```bash
pnpm dev                     # Vite dev server
pnpm build                   # tsc + vite build
pnpm lint                    # ESLint
```

## Running the Whole Stack in Docker

`docker-compose.yml` also defines `backend` and `frontend` services that build from each package's `Dockerfile`. Bring up everything with:

```bash
docker compose --profile full up -d
```

(or `docker compose up -d backend frontend` to start just the app containers alongside infra). The frontend container serves on `http://localhost:5173` and proxies `/api` to the backend.

## Environment Variables

Backend (`yehub-be/.env`, copy from `.env.example`):

- `DATABASE_URL` — Postgres connection string
- `REDIS_URL` — Redis connection string
- `JWT_SECRET`, `JWT_REFRESH_SECRET` — token signing
- `S3_*` — object-storage config
- `SMTP_*` — email config

Frontend: `VITE_API_URL` (defaults to `http://localhost:3000/v1`).

## CI/CD

GitHub Actions run on push and PR to `main`:

- **yehub-be** — install → Prisma generate → lint → test → build
- **yehub-fe** — install → format check → lint → build

Production deploys to Render (see `render.yaml`).

## Repository Conventions

- **Backend**: single quotes, trailing commas, strict TypeScript, ES2023 target
- **Frontend**: no semicolons, single quotes, trailing commas, 120-char width
- Both enforce style via ESLint + Prettier — run `pnpm lint` before committing
- Generated Prisma client lives at `yehub-be/generated/prisma/` and must never be hand-edited
