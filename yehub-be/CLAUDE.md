# Project Guidelines for Claude

## Package Manager

This project uses **pnpm**. Always use `pnpm` — never `npm` or `yarn`.

```bash
pnpm add <package>       # install a dependency
pnpm add -D <package>    # install a dev dependency
pnpm remove <package>    # remove a dependency
pnpm install             # install all dependencies
```

## Tech Stack

- **Framework:** NestJS 11 (TypeScript)
- **Database:** PostgreSQL 17 via Prisma ORM
- **Cache:** Redis 7 via cache-manager + @keyv/redis
- **Queue:** BullMQ + @nestjs/bullmq (Redis-backed)
- **Logging:** nestjs-pino (structured JSON logs, pino-pretty in dev)
- **API Docs:** Swagger at `/api/docs` (URI-versioned, default v1)

## Project Structure

```
src/
├── main.ts                  # API entry: HTTP server, Pino logger, Swagger
├── worker.ts                # Worker entry: BullMQ processors + tiny health HTTP server
├── app.module.ts            # API root module (HTTP + scheduler — no processors)
├── worker.module.ts         # Worker root module (processors + health)
├── prisma/                  # Global PrismaModule + PrismaService
├── polling/
│   ├── polling.module.ts            # Scheduler + adapters (loaded by API)
│   └── polling-processor.module.ts  # PollingProcessor host (loaded by worker)
└── queue/                   # BullMQ setup
    ├── queue.module.ts      # Redis connection + default job options
    └── queue.constants.ts   # Queue name constants
prisma/
└── schema.prisma            # Database schema
generated/
└── prisma/                  # Auto-generated Prisma client (do not edit)
```

The API and worker run as **two separate processes** sharing one Docker image. Only the worker registers BullMQ processors; the API only enqueues jobs.

## Common Commands

```bash
# Development
pnpm start:dev               # API only (HTTP on :3000)
pnpm start:worker:dev        # Worker only (BullMQ + health on :3001) — run in a second terminal
pnpm build                   # compile TypeScript

# Testing
pnpm test                    # unit tests
pnpm test:e2e                # end-to-end tests
pnpm test:cov                # coverage report

# Database
pnpm prisma:generate         # regenerate Prisma client after schema changes
pnpm prisma:migrate          # create + apply a migration
pnpm prisma:migrate:deploy   # apply migrations (production)
pnpm prisma:studio           # open Prisma Studio UI
pnpm prisma:seed             # seed the database

# Code quality
pnpm lint                    # ESLint with auto-fix
pnpm format                  # Prettier formatting
```

## Environment Variables

Required in `.env`:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/yehub
REDIS_URL=redis://localhost:6379
PORT=3000                    # optional, defaults to 3000
```

Start dependencies with Docker:

```bash
docker compose up -d         # starts PostgreSQL 17 + Redis 7
```

## Architecture Conventions

### Modules
- Feature modules should follow NestJS module pattern (controller, service, module)
- Use `PrismaModule` (global) for database access — inject `PrismaService` directly
- Use `CacheModule` (global) for caching — inject `CACHE_MANAGER` token

### Queue
- Define queue names as constants in `queue/queue.constants.ts`
- Register producers with `BullModule.registerQueue({ name: QUEUE_NAMES.X })` in the feature module — these are imported by `AppModule` (API) so request handlers can enqueue
- Processors (`@Processor(...)`) must NOT be registered in `AppModule`. Add them to a dedicated `*-processor.module.ts` that is imported only by `WorkerModule`
- Default job config: 3 attempts, exponential backoff (1s initial), keeps 100 completed / 500 failed

### API Versioning
- All routes are URI-versioned (e.g., `/v1/...`)
- Default version is `1` — set explicitly on controllers or use `VERSION_NEUTRAL`

### Logging
- Use NestJS `Logger` class (not `console.log`)
- Pino serializes HTTP requests/responses automatically

### Prisma
- After modifying `prisma/schema.prisma`, always run `pnpm prisma:generate`
- Never edit files under `generated/` manually
- Migrations live in `prisma/migrations/`

## Code Style

- Prettier: single quotes, trailing commas (configured in `.prettierrc`)
- ESLint: TypeScript strict rules + Prettier integration
- Target: ES2023, strict null checks enabled
