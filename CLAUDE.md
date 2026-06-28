# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

Monorepo for the YeHub platform with four packages, all using **pnpm** (never npm or yarn):

| Directory | Description | Stack |
|-----------|-------------|-------|
| `yehub-be/` | Backend API | NestJS 11, Prisma 7, PostgreSQL 17, Redis 7, BullMQ |
| `yehub-fe/` | Main frontend | React 19, Vite, Tailwind CSS v4, shadcn/ui, TanStack Query v5 |
| `yehub-demo/` | Demo/showcase app | Same as yehub-fe + i18n (react-i18next), MSW v2 mocking |
| `yehub-e2e/` | E2E tests | Playwright (Chromium) |

Each package has its own `CLAUDE.md` with detailed conventions — **read those before working in a specific package**.

## Local Development

Start all infrastructure:
```bash
docker compose up -d    # PostgreSQL 17, Redis 7, MinIO (S3), smtp4dev
```

### Backend (`yehub-be/`)
```bash
cd yehub-be
pnpm install
cp .env.example .env
pnpm prisma:migrate          # apply migrations
pnpm prisma:generate         # generate Prisma client
pnpm prisma:seed             # seed database
pnpm start:dev               # http://localhost:3000
```

### Frontend (`yehub-fe/`)
```bash
cd yehub-fe
pnpm install
pnpm dev                     # http://localhost:5173
```

### E2E Tests (`yehub-e2e/`)
```bash
cd yehub-e2e
npm test                     # runs with Docker Compose (auto-starts services)
npm run test:headed          # visible browser
npm run test:ui              # Playwright UI mode
```

## Common Commands

### Backend
```bash
pnpm start:dev               # dev server with watch
pnpm build                   # compile TypeScript
pnpm test                    # all unit tests (Jest)
pnpm test -- auth.service.spec   # single test file
pnpm lint                    # ESLint with auto-fix
pnpm prisma:migrate --name <name>  # create migration
pnpm prisma:generate         # regenerate client after schema changes
pnpm prisma:studio           # GUI for database
```

### Frontend
```bash
pnpm dev                     # Vite dev server
pnpm build                   # tsc + vite build
pnpm lint                    # ESLint
```

## Architecture

### Backend (`yehub-be/`)

NestJS modular architecture with global `PrismaModule` and `CacheModule`:

- **Auth** — JWT access tokens (5m) + refresh tokens (7d) with session-based tracking. Each login creates a `Session` row with device metadata. `JwtStrategy` validates access tokens (stateless — does not check session existence for performance). Refresh flow checks session validity.
- **API versioning** — URI-based (e.g., `/v1/`), default version `1`
- **Queue** — BullMQ processors in `queue/processors/`, queue names in `queue.constants.ts`
- **Uploads** — S3-compatible storage (MinIO locally, any S3 in prod)
- **Mail** — Nodemailer with smtp4dev for local capture
- **Swagger** — Available at `/api/docs`

Prisma schema lives in `yehub-be/prisma/schema.prisma`. Generated client is at `yehub-be/generated/prisma/` (never edit). After schema changes, always run `pnpm prisma:generate`.

### Frontend (`yehub-fe/`)

- **API layer** — Single Axios instance in `src/api/client.ts` with JWT interceptor that handles silent token refresh. Domain API functions in `src/api/<domain>.ts`. Never create additional Axios instances.
- **State** — Server state via TanStack React Query. Global state via Zustand (only `auth.store` and `theme.store`). Adding new Zustand stores requires explicit approval.
- **Routing** — `createBrowserRouter` in `src/router.tsx` with lazy-loaded pages. Route guards: `<ProtectedRoute>` (auth), `<AdminRoute>` (admin role), `<GuestOnly>` (redirects logged-in users from auth pages).
- **Auth flow** — Zustand persists tokens to localStorage (key: `yehub-auth`). Cross-tab logout via `storage` event. `GuestOnly` prevents login-page race conditions.
- **Forms** — React Hook Form + Zod. Shared schemas in `src/lib/schemas.ts`.
- **UI** — shadcn/ui primitives in `src/components/ui/` (managed by CLI, don't edit). Add new ones via `pnpm dlx shadcn@latest add <component>`.
- **Environment** — Access via `src/env.ts` only, never read `import.meta.env` directly.

### Data Model (key relationships)

`User` → has many `Session` (device-tracked auth), has many `ProjectMembership`.
`Project` → has many `ProjectMembership`, has many `Campaign`, has one `Category`.
`Campaign` → has many `Post`. `Post` → has many `Comment`.

## Environment Variables

Backend requires `.env` (copy from `.env.example`):
- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection string
- `JWT_SECRET`, `JWT_REFRESH_SECRET` — Token signing
- `S3_*` — Object storage config
- `SMTP_*` — Email config

Frontend requires `VITE_API_URL` (defaults to `http://localhost:3000/v1`).

## CI/CD

GitHub Actions run on push/PR to `main`:
- **yehub-be**: Install → Prisma generate → Lint → Test → Build
- **yehub-fe**: Install → Format check → Lint → Build

Production deploys to Render (see `render.yaml`).

## Code Style

- **Backend**: Single quotes, trailing commas, strict TypeScript, ES2023 target
- **Frontend**: No semicolons, single quotes, trailing commas, 120 char width
- Both enforce via ESLint + Prettier — run `pnpm lint` before committing

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **yehub-platform** (6709 symbols, 11902 relationships, 185 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/yehub-platform/context` | Codebase overview, check index freshness |
| `gitnexus://repo/yehub-platform/clusters` | All functional areas |
| `gitnexus://repo/yehub-platform/processes` | All execution flows |
| `gitnexus://repo/yehub-platform/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
