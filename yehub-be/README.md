# yehub-be

NestJS backend for the YeHub platform.

## Tech Stack

- **Framework:** NestJS 11 (TypeScript)
- **Database:** PostgreSQL 17 via Prisma ORM
- **Cache:** Redis 7 via cache-manager + @keyv/redis
- **Queue:** BullMQ + @nestjs/bullmq (Redis-backed)
- **Storage:** S3-compatible (MinIO for local dev)
- **Logging:** nestjs-pino (structured JSON)
- **API Docs:** Swagger at `/api/docs`

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm
- Docker

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start infrastructure

```bash
docker compose up -d
```

Starts PostgreSQL 17, Redis 7, and MinIO.

### 3. Configure environment

```bash
cp .env.example .env
```

Default `.env` values work out of the box with the Docker setup:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/yehub?schema=public"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="your-jwt-secret-here"
JWT_REFRESH_SECRET="your-jwt-refresh-secret-here"
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=yehub
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
```

### 4. Run migrations and seed

```bash
pnpm prisma:migrate
pnpm prisma:seed
```

### 5. Start the dev server

> Make sure `docker compose up -d` is running before starting the server.

```bash
pnpm start:dev
```

- API: `http://localhost:3000/v1`
- Swagger: `http://localhost:3000/api/docs`
- MinIO console: `http://localhost:9001` (user: `minioadmin`, password: `minioadmin`)

## Scripts

| Command | Description |
|---|---|
| `pnpm start:dev` | Start with watch mode |
| `pnpm start:prod` | Start compiled production build |
| `pnpm build` | Compile TypeScript |
| `pnpm test` | Unit tests |
| `pnpm test:e2e` | End-to-end tests |
| `pnpm test:cov` | Tests with coverage |
| `pnpm lint` | ESLint with auto-fix |
| `pnpm format` | Prettier formatting |
| `pnpm prisma:generate` | Regenerate Prisma client after schema changes |
| `pnpm prisma:migrate` | Create and apply a migration |
| `pnpm prisma:migrate:deploy` | Apply migrations (production) |
| `pnpm prisma:studio` | Open Prisma Studio UI |
| `pnpm prisma:seed` | Seed the database |
| `pnpm prisma:reset` | Reset the database (destructive) |
