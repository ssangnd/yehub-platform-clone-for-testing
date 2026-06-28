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

- **Framework:** React 19 + Vite + TypeScript
- **Styling:** Tailwind CSS v4
- **UI Components:** shadcn/ui (Radix UI primitives)
- **Routing:** React Router Dom v7 (file-based lazy loading)
- **Data Fetching:** TanStack React Query v5
- **Forms:** React Hook Form v7 + Zod v4
- **Charts:** Recharts
- **Icons:** Lucide React
- **Toasts:** Sonner
- **i18n:** react-i18next (en, vi)
- **Mocking:** MSW v2 (dev only)

## Common Commands

```bash
pnpm dev                 # start dev server (Vite)
pnpm build               # tsc + vite build
pnpm lint                # ESLint
pnpm preview             # preview production build
```

## Project Structure

```
src/
├── components/
│   ├── charts/          # Recharts-based chart components
│   ├── comments/        # Comment feed components
│   ├── common/          # Shared reusable components
│   ├── layout/          # AppShell, Sidebar, TopBar, PageHeader
│   ├── providers/       # React context providers
│   └── ui/              # shadcn/ui primitives (do not edit manually)
├── contexts/            # React contexts (AppSettingsContext, etc.)
├── hooks/               # Custom hooks (useAuth, useTheme, etc.)
├── i18n/                # Translation files (en.json, vi.json)
├── lib/
│   ├── constants/       # App-wide constants (routes, roles, platforms)
│   └── utils/           # Utility functions
├── mocks/               # MSW handlers and fixtures (dev only)
│   ├── handlers/        # API route handlers
│   └── fixtures/        # Static mock data
├── pages/               # Feature pages, organized by domain
│   ├── admin/
│   ├── auth/
│   ├── campaigns/
│   ├── profiles/
│   ├── projects/
│   └── ...
├── router/              # createBrowserRouter config + guards
└── types/               # Shared TypeScript types
```

## Naming Conventions

- **Components:** PascalCase for component names and their files (`LoginForm.tsx`, `MetricCard.tsx`).
- **Non-component files & folders:** kebab-case (`format-date.ts`, `user-profile.css`).
- **File extension:** Use `.tsx` for any file that contains JSX; use `.ts` otherwise.

## Folder Structure Best Practices

- **Feature-based pages:** Place page-specific sub-components inside a `components/` subfolder within the feature folder (e.g., `pages/campaigns/components/`).
- **Shared components:** Place cross-feature reusable components in `src/components/common/` or the appropriate subfolder.
- **Colocation:** Keep a page's styles, logic, and sub-components next to the page file, not scattered in global folders.
- **Plural root folders:** Use plural names for top-level grouping folders (`components`, `hooks`, `pages`).

## React Conventions

- **Functional components only.** Do not use class components.
- **Single responsibility.** Keep components small and focused; extract sub-components when a component grows large.
- **Local state first.** Use `useState`/`useReducer` for component-local state. Only reach for a global solution when state genuinely needs to be shared across distant parts of the tree.
- **Global state (Zustand): requires approval.** Before adding or expanding a Zustand store, warn the user and get explicit approval. Prefer React Query cache, URL state, or context for most cases.
- **Custom hooks:** Extract reusable stateful logic into `src/hooks/`. Name hooks with the `use` prefix.
- **Context:** Use React context for cross-cutting concerns (auth, theme, settings). Place providers in `src/components/providers/` or `src/contexts/`.

## Routing

- All routes are defined in `src/router/routes.tsx` using `createBrowserRouter`.
- Route path strings live in `src/lib/constants/routes.ts` — always reference `ROUTES.*` constants; never hardcode path strings.
- Pages are lazy-loaded with `React.lazy` + `<Suspense>` via the `SuspenseWrapper` helper.
- Access control is enforced via `<ProtectedRoute>` (auth) and `<RoleGuard allowedRoles={[...]}>` (RBAC).

## Data Fetching

- Use **TanStack React Query** for all server state (fetching, caching, mutations).
- Do not store server data in component state or Zustand — that is React Query's job.
- Define query/mutation logic in dedicated hooks co-located with the feature or in `src/hooks/`.

## Forms

- Use **React Hook Form** for all form state.
- Define validation schemas with **Zod** and connect via `@hookform/resolvers/zod`.
- Do not mix controlled React state with RHF-managed fields.

## UI Components

- Prefer **shadcn/ui** primitives from `src/components/ui/` before building custom equivalents.
- Add new shadcn components via the CLI: `pnpm dlx shadcn@latest add <component>` — do not copy files manually.
- Do not edit files under `src/components/ui/` manually; they are managed by the shadcn CLI.

## Internationalisation

- All user-visible strings must use `react-i18next` (`useTranslation` hook / `t()` function).
- Add new keys to both `src/i18n/en.json` and `src/i18n/vi.json`.

## Mocking (MSW)

- API mocks live in `src/mocks/handlers/` and are only active in development.
- Static fixture data is in `src/mocks/fixtures/`.
- Do not import mocks or fixtures in production code paths.

## Code Style

- TypeScript strict mode is enabled — avoid `any`; use proper types or `unknown`.
- Prettier and ESLint are configured — run `pnpm lint` before committing.
- Use the `cn()` utility from `src/lib/utils.ts` for conditional Tailwind class merging.
