# Admin Users — Search, Filter & URL-Synced State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add case-insensitive search (name+email) and multi-select role/status filters to the `/admin/users` endpoint, then wire a URL-synced toolbar + filter chips + empty state onto the admin Users page so filtered views are deep-linkable.

**Architecture:** Backend extends the existing `ListUsersQueryDto` with `q`, `role[]`, `status[]` and builds a `Prisma.UserWhereInput` inside the existing `$transaction`. Frontend moves list state (search, filters, sort, page) into the URL via `useSearchParams`, debounces search, and adds a toolbar built from shadcn `Input` + `Popover` + `Command`. Pattern mirrors the existing `Projects` list feature.

**Tech Stack:** NestJS 11 + Prisma (Postgres) + class-validator/class-transformer on the backend; React 19 + Vite + TanStack Query v5 + shadcn/ui + react-router v7 on the frontend. Package manager: **pnpm**.

**Spec:** `docs/superpowers/specs/2026-04-11-admin-users-search-filter-design.md`

**Out of scope:** cursor pagination, generic `useListQuery` abstraction, enum deduplication between BE/FE, changes to the Projects list page.

---

## File Structure

**Backend (`yehub-be/`):**
- Modify `src/admin/dto/list-users-query.dto.ts` — add `q`, `role`, `status`
- Modify `src/admin/admin.service.ts` — add `buildListUsersWhere` + apply to `listUsers`
- Modify `src/admin/admin.service.spec.ts` — extend existing `describe('listUsers')` block

No controller changes required — `listUsers` already accepts `@Query() query: ListUsersQueryDto`.

**Frontend (`yehub-fe/`):**
- Modify `src/lib/constants/query-keys.ts` — refactor `adminUsers.list` to object signature
- Modify `src/api/admin.ts` — extend `listUsers` params + `URLSearchParams` serialization
- Add `src/components/ui/popover.tsx` — via `pnpm dlx shadcn@latest add popover`
- Rewrite `src/pages/admin/AdminPanelPage/use-admin-users.ts` — URL state + filter controls
- Create `src/pages/admin/AdminPanelPage/components/UsersFilterToolbar.tsx`
- Create `src/pages/admin/AdminPanelPage/components/UsersFilterChips.tsx`
- Modify `src/pages/admin/AdminPanelPage/index.tsx` — wire toolbar + chips + empty state

**FE test convention:** The frontend has no unit-test infrastructure (no `vitest`/`jest`, no existing `*.test.ts` files). FE tasks verify via `pnpm lint`, `pnpm build` (type-check), and a manual browser walkthrough in Task 10. Do not invent new FE test infra as part of this plan.

---

## Task 1: Backend — extend `ListUsersQueryDto` with `q`, `role`, `status`

**Files:**
- Modify: `yehub-be/src/admin/dto/list-users-query.dto.ts`
- Test: `yehub-be/src/admin/dto/list-users-query.dto.spec.ts` (create)

### - [ ] Step 1: Write the failing DTO validation test

Create `yehub-be/src/admin/dto/list-users-query.dto.spec.ts`:

```ts
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListUsersQueryDto } from './list-users-query.dto';

async function parse(raw: Record<string, unknown>) {
  const dto = plainToInstance(ListUsersQueryDto, raw, {
    enableImplicitConversion: false,
  });
  const errors = await validate(dto);
  return { dto, errors };
}

describe('ListUsersQueryDto', () => {
  describe('q', () => {
    it('accepts a trimmed non-empty string', async () => {
      const { dto, errors } = await parse({ q: '  alice  ' });
      expect(errors).toHaveLength(0);
      expect(dto.q).toBe('alice');
    });

    it('rejects strings longer than 100 chars', async () => {
      const { errors } = await parse({ q: 'a'.repeat(101) });
      expect(errors.map((e) => e.property)).toContain('q');
    });

    it('is optional', async () => {
      const { dto, errors } = await parse({});
      expect(errors).toHaveLength(0);
      expect(dto.q).toBeUndefined();
    });
  });

  describe('role', () => {
    it('wraps a single value into an array', async () => {
      const { dto, errors } = await parse({ role: 'ADMIN' });
      expect(errors).toHaveLength(0);
      expect(dto.role).toEqual(['ADMIN']);
    });

    it('accepts multiple values as an array', async () => {
      const { dto, errors } = await parse({
        role: ['ADMIN', 'INTERNAL_USER'],
      });
      expect(errors).toHaveLength(0);
      expect(dto.role).toEqual(['ADMIN', 'INTERNAL_USER']);
    });

    it('rejects unknown enum values', async () => {
      const { errors } = await parse({ role: 'SUPERVISOR' });
      expect(errors.map((e) => e.property)).toContain('role');
    });
  });

  describe('status', () => {
    it('wraps a single value into an array', async () => {
      const { dto, errors } = await parse({ status: 'ACTIVE' });
      expect(errors).toHaveLength(0);
      expect(dto.status).toEqual(['ACTIVE']);
    });

    it('rejects unknown enum values', async () => {
      const { errors } = await parse({ status: 'PENDING' });
      expect(errors.map((e) => e.property)).toContain('status');
    });
  });
});
```

### - [ ] Step 2: Run test to verify it fails

Run: `cd yehub-be && pnpm test list-users-query.dto.spec`

Expected: FAIL — every test fails because `q`, `role`, `status` do not exist on the DTO yet.

### - [ ] Step 3: Implement the DTO changes

Replace `yehub-be/src/admin/dto/list-users-query.dto.ts` with:

```ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { GlobalRole, UserStatus } from '../../../generated/prisma/client';

function toArray<T>(value: unknown): T[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return (Array.isArray(value) ? value : [value]) as T[];
}

export class ListUsersQueryDto {
  @ApiPropertyOptional({ description: 'Page number (1-based)', default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', default: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: ['name', 'role', 'last_login_at'],
  })
  @IsString()
  @IsIn(['name', 'role', 'last_login_at'])
  @IsOptional()
  sortBy?: 'name' | 'role' | 'last_login_at';

  @ApiPropertyOptional({ description: 'Sort direction', enum: ['asc', 'desc'] })
  @IsString()
  @IsIn(['asc', 'desc'])
  @IsOptional()
  sortDir?: 'asc' | 'desc';

  @ApiPropertyOptional({
    description: 'Search query matching name or email (case-insensitive)',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100)
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({
    description: 'Filter by one or more global roles',
    enum: GlobalRole,
    isArray: true,
  })
  @Transform(({ value }) => toArray<GlobalRole>(value))
  @IsEnum(GlobalRole, { each: true })
  @IsOptional()
  role?: GlobalRole[];

  @ApiPropertyOptional({
    description: 'Filter by one or more user statuses',
    enum: UserStatus,
    isArray: true,
  })
  @Transform(({ value }) => toArray<UserStatus>(value))
  @IsEnum(UserStatus, { each: true })
  @IsOptional()
  status?: UserStatus[];
}
```

### - [ ] Step 4: Run test to verify it passes

Run: `cd yehub-be && pnpm test list-users-query.dto.spec`

Expected: PASS — all nine tests green.

### - [ ] Step 5: Lint + commit

Run: `cd yehub-be && pnpm lint`

Expected: no errors in modified files.

```bash
cd /Users/dustin.nguyen/Working/yehub-platform
git add yehub-be/src/admin/dto/list-users-query.dto.ts yehub-be/src/admin/dto/list-users-query.dto.spec.ts
git commit -m "feat(be): add q, role, status filters to ListUsersQueryDto"
```

---

## Task 2: Backend — apply filters in `AdminService.listUsers`

**Files:**
- Modify: `yehub-be/src/admin/admin.service.ts:44-83`
- Modify: `yehub-be/src/admin/admin.service.spec.ts:129-216`

### - [ ] Step 1: Write the failing service tests

Add inside the existing `describe('listUsers', () => { ... })` block in `yehub-be/src/admin/admin.service.spec.ts`, right before the closing `});` at line 216:

```ts
    describe('filters', () => {
      it('applies case-insensitive search on name and email via q', async () => {
        prisma.user.findMany.mockResolvedValue([]);
        prisma.user.count.mockResolvedValue(0);

        await service.listUsers({ q: 'alice' });

        const expectedWhere = {
          OR: [
            { name: { contains: 'alice', mode: 'insensitive' } },
            { email: { contains: 'alice', mode: 'insensitive' } },
          ],
        };
        expect(prisma.user.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: expectedWhere }),
        );
        expect(prisma.user.count).toHaveBeenCalledWith({ where: expectedWhere });
      });

      it('treats empty-string q as no search', async () => {
        prisma.user.findMany.mockResolvedValue([]);
        prisma.user.count.mockResolvedValue(0);

        await service.listUsers({ q: '' });

        expect(prisma.user.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: {} }),
        );
      });

      it('applies role filter as Prisma `in`', async () => {
        prisma.user.findMany.mockResolvedValue([]);
        prisma.user.count.mockResolvedValue(0);

        await service.listUsers({
          role: ['ADMIN', 'INTERNAL_USER'] as never,
        });

        expect(prisma.user.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { role: { in: ['ADMIN', 'INTERNAL_USER'] } },
          }),
        );
      });

      it('applies status filter as Prisma `in`', async () => {
        prisma.user.findMany.mockResolvedValue([]);
        prisma.user.count.mockResolvedValue(0);

        await service.listUsers({ status: ['INVITED'] as never });

        expect(prisma.user.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { status: { in: ['INVITED'] } },
          }),
        );
      });

      it('ignores empty role and status arrays', async () => {
        prisma.user.findMany.mockResolvedValue([]);
        prisma.user.count.mockResolvedValue(0);

        await service.listUsers({ role: [], status: [] });

        expect(prisma.user.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: {} }),
        );
      });

      it('composes q + role + status into a single where clause', async () => {
        prisma.user.findMany.mockResolvedValue([]);
        prisma.user.count.mockResolvedValue(0);

        await service.listUsers({
          q: 'bob',
          role: ['ADMIN'] as never,
          status: ['ACTIVE'] as never,
        });

        expect(prisma.user.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              OR: [
                { name: { contains: 'bob', mode: 'insensitive' } },
                { email: { contains: 'bob', mode: 'insensitive' } },
              ],
              role: { in: ['ADMIN'] },
              status: { in: ['ACTIVE'] },
            },
          }),
        );
      });

      it('passes the same where to count and findMany so total reflects filtered rows', async () => {
        prisma.user.findMany.mockResolvedValue([]);
        prisma.user.count.mockResolvedValue(0);

        await service.listUsers({ q: 'x' });

        const findManyWhere = prisma.user.findMany.mock.calls[0][0].where;
        const countWhere = prisma.user.count.mock.calls[0][0].where;
        expect(findManyWhere).toEqual(countWhere);
      });
    });
```

### - [ ] Step 2: Run tests to verify they fail

Run: `cd yehub-be && pnpm test admin.service.spec`

Expected: FAIL — the new `filters` describe block fails; previous tests still pass.

### - [ ] Step 3: Implement the `where` builder

Modify `yehub-be/src/admin/admin.service.ts`. Replace the `listUsers` method (currently lines 44–83) with:

```ts
  async listUsers(query: ListUsersQueryDto = {}) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const orderBy = query.sortBy
      ? { [query.sortBy]: query.sortDir ?? 'asc' }
      : { created_at: 'desc' as const };

    const select = {
      ...USER_BASE_SELECT,
      _count: { select: { memberships: true } },
    } as const;

    type UserListRow = Prisma.UserGetPayload<{ select: typeof select }>;

    const where = this.buildListUsersWhere(query);

    const [users, total] = (await this.prisma.$transaction([
      this.prisma.user.findMany({ where, select, orderBy, skip, take: limit }),
      this.prisma.user.count({ where }),
    ])) as [UserListRow[], number];

    return {
      data: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        status: u.status,
        last_login_at: u.last_login_at,
        created_at: u.created_at,
        avatar: u.avatar,
        project_count: u._count.memberships,
      })),
      total,
      page,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    };
  }

  private buildListUsersWhere(
    query: ListUsersQueryDto,
  ): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = {};
    const q = query.q?.trim();
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (query.role && query.role.length > 0) {
      where.role = { in: query.role };
    }
    if (query.status && query.status.length > 0) {
      where.status = { in: query.status };
    }
    return where;
  }
```

### - [ ] Step 4: Run tests to verify they pass

Run: `cd yehub-be && pnpm test admin.service.spec`

Expected: PASS — all pre-existing `listUsers` tests still green plus the seven new `filters` tests.

### - [ ] Step 5: Full BE test suite + lint + commit

Run: `cd yehub-be && pnpm test && pnpm lint`

Expected: full suite green, no lint errors.

```bash
cd /Users/dustin.nguyen/Working/yehub-platform
git add yehub-be/src/admin/admin.service.ts yehub-be/src/admin/admin.service.spec.ts
git commit -m "feat(be): filter listUsers by q, role, status"
```

---

## Task 3: Frontend — refactor `queryKeys.adminUsers.list` to object signature

**Files:**
- Modify: `yehub-fe/src/lib/constants/query-keys.ts`

No FE unit tests; verification is type-check + grep for stale callers.

### - [ ] Step 1: Update the query-key builder

Modify `yehub-fe/src/lib/constants/query-keys.ts`. Replace the `adminUsers` block:

```ts
export type AdminUsersListParams = {
  q: string
  roles: readonly string[]
  statuses: readonly string[]
  sortKey: string | null
  sortDir: 'asc' | 'desc'
  page: number
}

export const queryKeys = {
  me: ['me'] as const,

  invitation: (token: string) => ['invitation', token] as const,

  adminUsers: {
    all: ['admin-users'] as const,
    list: (params: AdminUsersListParams) =>
      ['admin-users', 'list', params] as const,
  },

  adminUser: (userId: string) => ['admin-user', userId] as const,

  // ...keep the rest of the file unchanged below this line
```

Leave `projects`, `project`, etc. below this block untouched.

### - [ ] Step 2: Find any existing callers of the old signature

Run (from repo root): search for `queryKeys.adminUsers.list(` to locate every call site.

Use Grep (or `rg`) for `adminUsers.list(` across `yehub-fe/src`. Expected match: exactly one — `yehub-fe/src/pages/admin/AdminPanelPage/use-admin-users.ts` (which we rewrite in Task 6). No other callers exist at the time of writing.

If additional matches appear, either update them in this task or flag them to the reviewer before proceeding — do not leave broken callers.

### - [ ] Step 3: Type-check

Run: `cd yehub-fe && pnpm build`

Expected: fails with a type error inside `use-admin-users.ts` because it still calls the old positional signature. This is the intended signal that Task 6 will fix.

> ⚠️ **Do not commit yet.** This task leaves the FE in an uncompilable state; it becomes green after Task 6. Tasks 3, 4, 5, and 6 are committed together at the end of Task 6.

---

## Task 4: Frontend — extend `adminApi.listUsers` with new params + array serialization

**Files:**
- Modify: `yehub-fe/src/api/admin.ts`

### - [ ] Step 1: Update `listUsers` signature and serialization

Replace the `listUsers` entry in `yehub-fe/src/api/admin.ts` (currently lines 43–49):

```ts
export const adminApi = {
  listUsers: (params?: {
    sortBy?: 'name' | 'role' | 'last_login_at'
    sortDir?: 'asc' | 'desc'
    page?: number
    limit?: number
    q?: string
    role?: GlobalRole[]
    status?: UserStatus[]
  }) => {
    const search = new URLSearchParams()
    if (params?.sortBy) search.set('sortBy', params.sortBy)
    if (params?.sortDir) search.set('sortDir', params.sortDir)
    if (params?.page !== undefined) search.set('page', String(params.page))
    if (params?.limit !== undefined) search.set('limit', String(params.limit))
    if (params?.q) search.set('q', params.q)
    params?.role?.forEach((r) => search.append('role', r))
    params?.status?.forEach((s) => search.append('status', s))
    const qs = search.toString()
    return apiClient
      .get<PaginatedUsers>(`/admin/users${qs ? `?${qs}` : ''}`)
      .then((r) => r.data)
  },
```

Leave the other `adminApi` methods unchanged.

### - [ ] Step 2: Type-check

Run: `cd yehub-fe && pnpm build`

Expected: still fails in `use-admin-users.ts` (stale caller from Task 3). No new errors from `admin.ts`.

> ⚠️ **Do not commit yet** — batched with Task 6.

---

## Task 5: Frontend — install shadcn `popover` component

**Files:**
- Create: `yehub-fe/src/components/ui/popover.tsx` (generated by CLI; do not hand-edit)

### - [ ] Step 1: Install via shadcn CLI

Run: `cd yehub-fe && pnpm dlx shadcn@latest add popover`

Expected: creates `yehub-fe/src/components/ui/popover.tsx` exporting `Popover`, `PopoverTrigger`, `PopoverContent`. If the CLI prompts about package installs, accept the default.

### - [ ] Step 2: Verify the file was added

Confirm `yehub-fe/src/components/ui/popover.tsx` exists and exports `Popover`, `PopoverTrigger`, `PopoverContent`. (Other shadcn components such as `command`, `checkbox`, `badge`, `input` are already installed — do not re-add them.)

### - [ ] Step 3: Type-check

Run: `cd yehub-fe && pnpm build`

Expected: still fails in `use-admin-users.ts` (stale caller). No new errors from `popover.tsx`.

> ⚠️ **Do not commit yet** — batched with Task 6.

---

## Task 6: Frontend — rewrite `use-admin-users.ts` with URL state + filter controls

**Files:**
- Modify: `yehub-fe/src/pages/admin/AdminPanelPage/use-admin-users.ts`

### - [ ] Step 1: Replace the hook

Replace the entire contents of `yehub-fe/src/pages/admin/AdminPanelPage/use-admin-users.ts` with:

```ts
import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { adminApi, type UserStatus } from '@/api/admin'
import type { GlobalRole } from '@/api/auth'
import { useDebounce } from '@/hooks/use-debounce'
import { queryKeys } from '@/lib/constants/query-keys'

export type SortKey = 'name' | 'role' | 'last_login_at'

const PAGE_SIZE = 10

const VALID_ROLES: readonly GlobalRole[] = [
  'ADMIN',
  'INTERNAL_USER',
  'AUTHORIZED_USER',
]
const VALID_STATUSES: readonly UserStatus[] = ['INVITED', 'ACTIVE', 'INACTIVE']
const VALID_SORT_KEYS: readonly SortKey[] = ['name', 'role', 'last_login_at']

function parseEnumList<T extends string>(
  raw: string[],
  allowed: readonly T[],
): T[] {
  const set = new Set<T>()
  for (const value of raw) {
    if ((allowed as readonly string[]).includes(value)) set.add(value as T)
  }
  return Array.from(set)
}

export function useAdminUsers() {
  const [searchParams, setSearchParams] = useSearchParams()

  const q = searchParams.get('q') ?? ''
  const roles = useMemo(
    () => parseEnumList(searchParams.getAll('role'), VALID_ROLES),
    [searchParams],
  )
  const statuses = useMemo(
    () => parseEnumList(searchParams.getAll('status'), VALID_STATUSES),
    [searchParams],
  )
  const rawSortKey = searchParams.get('sortBy')
  const sortKey: SortKey | null =
    rawSortKey && (VALID_SORT_KEYS as readonly string[]).includes(rawSortKey)
      ? (rawSortKey as SortKey)
      : null
  const sortDir: 'asc' | 'desc' =
    searchParams.get('sortDir') === 'desc' ? 'desc' : 'asc'
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1)

  const debouncedQ = useDebounce(q, 300)

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.adminUsers.list({
      q: debouncedQ,
      roles,
      statuses,
      sortKey,
      sortDir,
      page,
    }),
    queryFn: () =>
      adminApi.listUsers({
        ...(sortKey ? { sortBy: sortKey, sortDir } : {}),
        page,
        limit: PAGE_SIZE,
        ...(debouncedQ ? { q: debouncedQ } : {}),
        ...(roles.length > 0 ? { role: roles } : {}),
        ...(statuses.length > 0 ? { status: statuses } : {}),
      }),
    placeholderData: keepPreviousData,
  })

  const mutate = (mutator: (next: URLSearchParams) => void) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        mutator(next)
        // Normalize: drop empty and default values
        if ((next.get('q') ?? '') === '') next.delete('q')
        if (next.get('sortDir') === 'asc' && !next.get('sortBy'))
          next.delete('sortDir')
        if (next.get('page') === '1') next.delete('page')
        return next
      },
      { replace: true },
    )
  }

  const setQ = (value: string) => {
    mutate((next) => {
      if (value) next.set('q', value)
      else next.delete('q')
      next.set('page', '1')
    })
  }

  const toggleRole = (role: GlobalRole) => {
    mutate((next) => {
      const current = next.getAll('role')
      next.delete('role')
      const nextList = current.includes(role)
        ? current.filter((r) => r !== role)
        : [...current, role]
      nextList.forEach((r) => next.append('role', r))
      next.set('page', '1')
    })
  }

  const toggleStatus = (status: UserStatus) => {
    mutate((next) => {
      const current = next.getAll('status')
      next.delete('status')
      const nextList = current.includes(status)
        ? current.filter((s) => s !== status)
        : [...current, status]
      nextList.forEach((s) => next.append('status', s))
      next.set('page', '1')
    })
  }

  const toggleSort = (key: SortKey) => {
    mutate((next) => {
      const currentKey = next.get('sortBy')
      const currentDir = next.get('sortDir')
      if (currentKey === key) {
        next.set('sortDir', currentDir === 'asc' ? 'desc' : 'asc')
      } else {
        next.set('sortBy', key)
        next.set('sortDir', 'asc')
      }
      next.set('page', '1')
    })
  }

  const setPage = (nextPage: number) => {
    mutate((next) => {
      next.set('page', String(nextPage))
    })
  }

  const clearFilters = () => {
    mutate((next) => {
      next.delete('q')
      next.delete('role')
      next.delete('status')
      next.set('page', '1')
    })
  }

  const hasActiveFilters =
    q.length > 0 || roles.length > 0 || statuses.length > 0

  return {
    // data
    users: data?.data ?? [],
    total: data?.total ?? 0,
    totalPages: data?.totalPages ?? 1,
    isLoading,
    isError,
    // state
    q,
    roles,
    statuses,
    sortKey,
    sortDir,
    page,
    hasActiveFilters,
    pageSize: PAGE_SIZE,
    // actions
    setQ,
    toggleRole,
    toggleStatus,
    toggleSort,
    setPage,
    clearFilters,
  }
}
```

### - [ ] Step 2: Type-check

Run: `cd yehub-fe && pnpm build`

Expected: PASS — type errors from Tasks 3/4/5 are now resolved. If the `AdminPanelPage` (`index.tsx`) reports type errors about `paginatedUsers` / `handleSort`, that is expected and handled in Task 9 — proceed.

If `pnpm build` still fails at the `AdminPanelPage` consumer of `paginatedUsers` or `handleSort`, that error is the Task 9 signal; leave it for now.

### - [ ] Step 3: Lint

Run: `cd yehub-fe && pnpm lint`

Expected: no errors in the hook file. Lint errors in `index.tsx` (unused `handleSort` etc.) are expected; they are resolved in Task 9.

### - [ ] Step 4: Commit Tasks 3–6 together

```bash
cd /Users/dustin.nguyen/Working/yehub-platform
git add yehub-fe/src/lib/constants/query-keys.ts \
        yehub-fe/src/api/admin.ts \
        yehub-fe/src/components/ui/popover.tsx \
        yehub-fe/src/pages/admin/AdminPanelPage/use-admin-users.ts
git commit -m "feat(fe): url-synced admin users list state with debounced search"
```

> Note: `index.tsx` is intentionally excluded from this commit — it still references the old hook surface and is fixed in Task 9. The build will be temporarily broken between this commit and the end of Task 9. If you need the working tree green before then, stash Task 9's starting state instead of breaking this sequence.

---

## Task 7: Frontend — create `UsersFilterToolbar` component

**Files:**
- Create: `yehub-fe/src/pages/admin/AdminPanelPage/components/UsersFilterToolbar.tsx`

### - [ ] Step 1: Create the toolbar component

Create `yehub-fe/src/pages/admin/AdminPanelPage/components/UsersFilterToolbar.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Check, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import type { UserStatus } from '@/api/admin'
import type { GlobalRole } from '@/api/auth'
import { GLOBAL_ROLE_CONFIG } from '@/lib/constants/roles'
import { cn } from '@/lib/utils'

const ROLES: readonly GlobalRole[] = ['ADMIN', 'INTERNAL_USER', 'AUTHORIZED_USER']
const STATUSES: readonly UserStatus[] = ['INVITED', 'ACTIVE', 'INACTIVE']

const STATUS_LABELS: Record<UserStatus, string> = {
  INVITED: 'Invited',
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
}

export interface UsersFilterToolbarProps {
  q: string
  roles: GlobalRole[]
  statuses: UserStatus[]
  total: number
  page: number
  pageSize: number
  hasActiveFilters: boolean
  onQChange: (value: string) => void
  onToggleRole: (role: GlobalRole) => void
  onToggleStatus: (status: UserStatus) => void
  onClearFilters: () => void
}

function MultiSelectFilter<T extends string>({
  label,
  options,
  selected,
  onToggle,
  getLabel,
}: {
  label: string
  options: readonly T[]
  selected: T[]
  onToggle: (value: T) => void
  getLabel: (value: T) => string
}) {
  const triggerLabel =
    selected.length === 0
      ? label
      : selected.length === 1
        ? `${label}: ${getLabel(selected[0])}`
        : `${label}: ${selected.length}`

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9">
          {triggerLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          <CommandList>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selected.includes(option)
                return (
                  <CommandItem
                    key={option}
                    onSelect={() => onToggle(option)}
                    className="cursor-pointer"
                  >
                    <div
                      className={cn(
                        'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'opacity-50 [&_svg]:invisible',
                      )}
                    >
                      <Check className="h-3 w-3" />
                    </div>
                    {getLabel(option)}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export function UsersFilterToolbar({
  q,
  roles,
  statuses,
  total,
  page,
  pageSize,
  hasActiveFilters,
  onQChange,
  onToggleRole,
  onToggleStatus,
  onClearFilters,
}: UsersFilterToolbarProps) {
  const [localQ, setLocalQ] = useState(q)

  // Keep local input in sync when the URL changes externally (clear filters, back/forward)
  useEffect(() => {
    setLocalQ(q)
  }, [q])

  const handleChange = (value: string) => {
    setLocalQ(value)
    onQChange(value)
  }

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1
  const rangeEnd = Math.min(page * pageSize, total)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[220px] flex-1 md:max-w-xs">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Search users"
          placeholder="Search by name or email"
          value={localQ}
          onChange={(e) => handleChange(e.target.value)}
          className="pl-8"
        />
        {localQ && (
          <button
            type="button"
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => handleChange('')}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <MultiSelectFilter
        label="Role"
        options={ROLES}
        selected={roles}
        onToggle={onToggleRole}
        getLabel={(r) => GLOBAL_ROLE_CONFIG[r].label}
      />

      <MultiSelectFilter
        label="Status"
        options={STATUSES}
        selected={statuses}
        onToggle={onToggleStatus}
        getLabel={(s) => STATUS_LABELS[s]}
      />

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={onClearFilters}>
          Clear
        </Button>
      )}

      <div
        role="status"
        aria-live="polite"
        className="ml-auto text-sm text-muted-foreground"
      >
        Showing {rangeStart}–{rangeEnd} of {total}
      </div>
    </div>
  )
}
```

### - [ ] Step 2: Type-check and lint

Run: `cd yehub-fe && pnpm build && pnpm lint`

Expected: `UsersFilterToolbar.tsx` type-checks cleanly. Existing errors in `index.tsx` (unused imports) are still expected until Task 9.

> ⚠️ **Do not commit yet.** Tasks 7, 8, and 9 are committed together at the end of Task 9.

---

## Task 8: Frontend — create `UsersFilterChips` component

**Files:**
- Create: `yehub-fe/src/pages/admin/AdminPanelPage/components/UsersFilterChips.tsx`

### - [ ] Step 1: Create the chips component

Create `yehub-fe/src/pages/admin/AdminPanelPage/components/UsersFilterChips.tsx`:

```tsx
import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { UserStatus } from '@/api/admin'
import type { GlobalRole } from '@/api/auth'
import { GLOBAL_ROLE_CONFIG } from '@/lib/constants/roles'

const STATUS_LABELS: Record<UserStatus, string> = {
  INVITED: 'Invited',
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
}

export interface UsersFilterChipsProps {
  q: string
  roles: GlobalRole[]
  statuses: UserStatus[]
  onClearQ: () => void
  onToggleRole: (role: GlobalRole) => void
  onToggleStatus: (status: UserStatus) => void
}

function Chip({
  label,
  ariaLabel,
  onRemove,
}: {
  label: string
  ariaLabel: string
  onRemove: () => void
}) {
  return (
    <Badge variant="secondary" className="gap-1 pr-1">
      {label}
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={onRemove}
        className="rounded-sm hover:bg-muted"
      >
        <X className="h-3 w-3" />
      </button>
    </Badge>
  )
}

export function UsersFilterChips({
  q,
  roles,
  statuses,
  onClearQ,
  onToggleRole,
  onToggleStatus,
}: UsersFilterChipsProps) {
  if (!q && roles.length === 0 && statuses.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      {q && (
        <Chip
          label={`Search: ${q}`}
          ariaLabel={`Remove filter: search ${q}`}
          onRemove={onClearQ}
        />
      )}
      {roles.map((role) => (
        <Chip
          key={role}
          label={`Role: ${GLOBAL_ROLE_CONFIG[role].label}`}
          ariaLabel={`Remove filter: role ${GLOBAL_ROLE_CONFIG[role].label}`}
          onRemove={() => onToggleRole(role)}
        />
      ))}
      {statuses.map((status) => (
        <Chip
          key={status}
          label={`Status: ${STATUS_LABELS[status]}`}
          ariaLabel={`Remove filter: status ${STATUS_LABELS[status]}`}
          onRemove={() => onToggleStatus(status)}
        />
      ))}
    </div>
  )
}
```

### - [ ] Step 2: Type-check and lint

Run: `cd yehub-fe && pnpm build && pnpm lint`

Expected: `UsersFilterChips.tsx` type-checks. Existing errors in `index.tsx` persist until Task 9.

> ⚠️ **Do not commit yet.** Batched with Task 9.

---

## Task 9: Frontend — wire toolbar, chips, and empty state into `AdminPanelPage`

**Files:**
- Modify: `yehub-fe/src/pages/admin/AdminPanelPage/index.tsx`

### - [ ] Step 1: Replace `AdminPanelPage`

Replace the entire contents of `yehub-fe/src/pages/admin/AdminPanelPage/index.tsx` with:

```tsx
import { useState } from 'react'
import { ArrowUp, ArrowDown, ArrowUpDown, UserPlus } from 'lucide-react'
import { useSetPageTitle } from '@/hooks/use-page-title'
import type { AdminUser } from '@/api/admin'
import type { GlobalRole } from '@/api/auth'
import { GLOBAL_ROLE_CONFIG } from '@/lib/constants/roles'
import { formatRelativeTime } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PageHeader } from '@/components/common/PageHeader'
import { PaginationBar } from '@/components/common/PaginationBar'
import { PageWrapper } from '@/components/common/PageWrapper'
import { useAdminUsers, type SortKey } from './use-admin-users'
import { InviteUserDialog } from './components/InviteUserDialog'
import { UserDetailDialog } from './components/UserDetailDialog'
import { UsersFilterToolbar } from './components/UsersFilterToolbar'
import { UsersFilterChips } from './components/UsersFilterChips'
import { StatusBadge } from './components/StatusBadge'

const ROLE_BADGE_VARIANT: Record<GlobalRole, 'destructive' | 'secondary'> = {
  ADMIN: 'destructive',
  INTERNAL_USER: 'secondary',
  AUTHORIZED_USER: 'secondary',
}

function RoleBadge({ role }: { role: GlobalRole }) {
  return <Badge variant={ROLE_BADGE_VARIANT[role]}>{GLOBAL_ROLE_CONFIG[role].label}</Badge>
}

function SortIcon({
  colKey,
  sortKey,
  sortDir,
}: {
  colKey: SortKey
  sortKey: SortKey | null
  sortDir: 'asc' | 'desc'
}) {
  if (sortKey !== colKey) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />
  return sortDir === 'asc' ? (
    <ArrowUp className="ml-1 h-3 w-3" />
  ) : (
    <ArrowDown className="ml-1 h-3 w-3" />
  )
}

export function AdminPanelPage() {
  useSetPageTitle('Users')

  const [inviteOpen, setInviteOpen] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)

  const {
    users,
    total,
    totalPages,
    isLoading,
    isError,
    q,
    roles,
    statuses,
    sortKey,
    sortDir,
    page,
    pageSize,
    hasActiveFilters,
    setQ,
    toggleRole,
    toggleStatus,
    toggleSort,
    setPage,
    clearFilters,
  } = useAdminUsers()

  return (
    <PageWrapper>
      <PageHeader
        title="Admin Panel"
        description="Manage users and permissions"
        actions={
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus />
            Invite User
          </Button>
        }
      />

      <UsersFilterToolbar
        q={q}
        roles={roles}
        statuses={statuses}
        total={total}
        page={page}
        pageSize={pageSize}
        hasActiveFilters={hasActiveFilters}
        onQChange={setQ}
        onToggleRole={toggleRole}
        onToggleStatus={toggleStatus}
        onClearFilters={clearFilters}
      />

      <UsersFilterChips
        q={q}
        roles={roles}
        statuses={statuses}
        onClearQ={() => setQ('')}
        onToggleRole={toggleRole}
        onToggleStatus={toggleStatus}
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-3 h-8 cursor-pointer"
                  onClick={() => toggleSort('name')}
                >
                  User <SortIcon colKey="name" sortKey={sortKey} sortDir={sortDir} />
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-3 h-8 cursor-pointer"
                  onClick={() => toggleSort('role')}
                >
                  Role <SortIcon colKey="role" sortKey={sortKey} sortDir={sortDir} />
                </Button>
              </TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Projects</TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-3 h-8 cursor-pointer"
                  onClick={() => toggleSort('last_login_at')}
                >
                  Last Login <SortIcon colKey="last_login_at" sortKey={sortKey} sortDir={sortDir} />
                </Button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Loading users…
                </TableCell>
              </TableRow>
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-destructive">
                  Failed to load users.
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  {hasActiveFilters ? (
                    <div className="flex flex-col items-center gap-2">
                      <span>No users match your filters.</span>
                      <Button variant="outline" size="sm" onClick={clearFilters}>
                        Clear filters
                      </Button>
                    </div>
                  ) : (
                    'No users found.'
                  )}
                </TableCell>
              </TableRow>
            ) : (
              users.map((user: AdminUser) => (
                <TableRow
                  key={user.id}
                  className="cursor-pointer"
                  onClick={() => setSelectedUserId(user.id)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarImage src={user?.avatar} alt={user?.name} />
                        <AvatarFallback>{(user.name[0] ?? '?').toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{user.name}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <RoleBadge role={user.role} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={user.status} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {user.role === 'ADMIN' ? 'All projects' : `${user.project_count} projects`}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {user.last_login_at ? formatRelativeTime(user.last_login_at) : 'Never'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <PaginationBar page={page} setPage={setPage} totalPages={totalPages} />

      <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} />

      {selectedUserId && (
        <UserDetailDialog
          userId={selectedUserId}
          open={!!selectedUserId}
          onOpenChange={(v) => {
            if (!v) setSelectedUserId(null)
          }}
        />
      )}
    </PageWrapper>
  )
}
```

### - [ ] Step 2: Type-check and lint

Run: `cd yehub-fe && pnpm build && pnpm lint`

Expected: clean build, no lint errors. The tree is now green end-to-end again.

### - [ ] Step 3: Commit Tasks 7–9 together

```bash
cd /Users/dustin.nguyen/Working/yehub-platform
git add yehub-fe/src/pages/admin/AdminPanelPage/components/UsersFilterToolbar.tsx \
        yehub-fe/src/pages/admin/AdminPanelPage/components/UsersFilterChips.tsx \
        yehub-fe/src/pages/admin/AdminPanelPage/index.tsx
git commit -m "feat(fe): add search, role, and status filters to admin users page"
```

---

## Task 10: Manual verification in the browser

**Files:** none modified.

No automated FE tests — this is the acceptance gate for the feature.

### - [ ] Step 1: Start backend and frontend dev servers

In one terminal:

```bash
cd /Users/dustin.nguyen/Working/yehub-platform/yehub-be
docker compose up -d    # if Postgres/Redis aren't already running
pnpm start:dev
```

In another:

```bash
cd /Users/dustin.nguyen/Working/yehub-platform/yehub-fe
pnpm dev
```

### - [ ] Step 2: Verify the golden path

Log in as an admin and navigate to the Users page (`/admin`). Walk through and confirm each:

1. **Search.** Type "a" → after ~300ms, the table filters and the result count updates. The URL shows `?q=a`. Clear the input → URL goes back to `/admin`.
2. **Role filter.** Open the Role popover, check "Admin" → only admin rows remain. URL shows `?role=ADMIN`. Check "Internal User" → URL shows `?role=ADMIN&role=INTERNAL_USER`, both roles appear. Uncheck "Admin" → URL shows `?role=INTERNAL_USER`.
3. **Status filter.** Same pattern on status values.
4. **Combined.** Set `q=alice` + `role=ADMIN` + `status=ACTIVE` → BE returns only matching rows, result count reflects the filtered total.
5. **Chips.** With filters active, the chip row appears. Click the × on any chip → that specific filter is removed. Click "Clear" in the toolbar → every filter resets, sort/page preserved.
6. **Empty state.** Enter a search that matches nothing (e.g. `q=zzzzzzzzz`) → table body shows "No users match your filters" with a "Clear filters" button; clicking it restores the list.
7. **Pagination resets on filter change.** Go to page 2, then toggle a filter → the page resets to 1.
8. **Sort resets on filter change.** Click a sort header, then toggle a filter → the URL keeps `sortBy` but `page` goes back to 1.
9. **URL sharing.** Copy the current URL (with filters), paste into a new tab → same filtered view renders.
10. **Browser back/forward.** After several filter changes, browser back/forward should walk through the state history.
11. **Accessibility check.** Tab through the toolbar: search input → role trigger → status trigger → clear button → sort headers. Role/Status popovers open with Space/Enter, Esc closes. A screen reader (VoiceOver: ⌘F5) announces the result count as `aria-live="polite"` updates.

### - [ ] Step 3: Regression sweep

Confirm none of these broke:

- Sorting by Name / Role / Last Login still works.
- Pagination (existing `PaginationBar`) still navigates pages.
- Clicking a user row still opens `UserDetailDialog`.
- "Invite User" button still opens `InviteUserDialog`.
- Other pages (`/projects`, etc.) are unaffected.

### - [ ] Step 4: Report completion

If everything above passes, the feature is done. If any step fails, capture the failing scenario and fix before closing. Do not mark this task complete on partial success.

No commit required for this task — it is verification only.

---

## Self-Review (for the plan author)

**Spec coverage:**

- BE DTO extension (q, role[], status[]) → Task 1 ✓
- BE where builder (case-insensitive OR, `in` filters, composition) → Task 2 ✓
- FE query-key refactor → Task 3 ✓
- FE API array serialization → Task 4 ✓
- Shadcn Popover install → Task 5 ✓
- Hook rewrite with URL sync, debounce, page-reset-on-filter-change, keepPreviousData → Task 6 ✓
- Toolbar (search + Role + Status + Clear + result count + `aria-live`) → Task 7 ✓
- Active filter chips → Task 8 ✓
- Empty state + wiring + sort still works → Task 9 ✓
- Manual verification covers golden path + a11y + regressions → Task 10 ✓

**Placeholder scan:** No "TBD", "TODO", or vague validation steps. Every code step shows the full code.

**Type consistency:** Hook surface (`users`, `toggleRole`, `toggleStatus`, `toggleSort`, `setQ`, `clearFilters`, `hasActiveFilters`, `pageSize`, `page`, `total`, `totalPages`, `isLoading`, `isError`, `q`, `roles`, `statuses`, `sortKey`, `sortDir`) is consistent across Task 6 (definition), Task 7 (`UsersFilterToolbar` props), Task 8 (`UsersFilterChips` props), and Task 9 (`AdminPanelPage` consumer). BE DTO field names (`q`, `role`, `status`, `sortBy`, `sortDir`, `page`, `limit`) match the FE serializer in Task 4 and the URL keys in Task 6.

**Scope check:** Single feature, single plan — appropriate granularity, no decomposition needed.
