# Admin List Users — Server-Side Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `GET /admin/users` to accept `page`, `limit`, `sortBy`, `sortDir` query params server-side and return a paginated `{ data, total, page, totalPages }` response.

**Architecture:** New `ListUsersQueryDto` DTO validates query params; `AdminService.listUsers` applies Prisma `skip`/`take`/`orderBy` with a `$transaction` count; frontend passes `page` to the query key and renders `data.data` directly — no client-side slicing.

**Tech Stack:** NestJS 11, Prisma, class-validator/class-transformer (backend); React 19, TanStack Query v5, Axios (frontend).

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `yehub-be/src/admin/dto/list-users-query.dto.ts` | Query param DTO with validation |
| Modify | `yehub-be/src/admin/admin.service.ts` | Accept query, apply pagination/sort, return `{ data, total, page, totalPages }` |
| Modify | `yehub-be/src/admin/admin.service.spec.ts` | Tests for `listUsers` pagination and sorting |
| Modify | `yehub-be/src/admin/admin.controller.ts` | Add `@Query()` to `listUsers` handler |
| Modify | `yehub-fe/src/api/admin.ts` | Add `page`/`limit` params, update return type |
| Modify | `yehub-fe/src/pages/admin/admin-panel.tsx` | Include `page` in query key, remove client-side slice |

---

### Task 1: Create `ListUsersQueryDto`

**Files:**
- Create: `yehub-be/src/admin/dto/list-users-query.dto.ts`

- [ ] **Step 1: Create the DTO file**

```typescript
// yehub-be/src/admin/dto/list-users-query.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

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
}
```

- [ ] **Step 2: Commit**

```bash
git add yehub-be/src/admin/dto/list-users-query.dto.ts
git commit -m "feat(admin): add ListUsersQueryDto"
```

---

### Task 2: Update `AdminService.listUsers` — TDD

**Files:**
- Modify: `yehub-be/src/admin/admin.service.ts`
- Modify: `yehub-be/src/admin/admin.service.spec.ts`

- [ ] **Step 1: Add `findMany`, `create`, and `$transaction` to the prisma mock in the spec**

The existing `prisma` mock at the top of `admin.service.spec.ts` only has `user.findUnique`, `user.update`, `user.count`. Add `user.findMany`, `user.create`, and `$transaction`:

```typescript
// Replace the existing prisma declaration and beforeEach with:
let service: AdminService;
let prisma: {
  user: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    count: jest.Mock;
  };
  $transaction: jest.Mock;
};

beforeEach(async () => {
  prisma = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn().mockImplementation((ops: Promise<unknown>[]) =>
      Promise.all(ops),
    ),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      AdminService,
      { provide: PrismaService, useValue: prisma },
      { provide: MailService, useValue: { sendInvitation: jest.fn() } },
      {
        provide: ConfigService,
        useValue: { get: jest.fn().mockReturnValue('http://localhost:5173') },
      },
    ],
  }).compile();

  service = module.get<AdminService>(AdminService);
});
```

- [ ] **Step 2: Write failing tests for `listUsers`**

Add this `describe` block after the `disableUser` block in `admin.service.spec.ts`:

```typescript
describe('listUsers', () => {
  const makeUser = (id: string) => ({
    id,
    email: `${id}@example.com`,
    name: id,
    role: 'AUTHORIZED_USER',
    active: true,
    last_login_at: null,
    created_at: new Date('2024-01-01'),
    _count: { memberships: 2 },
  });

  it('returns paginated data with defaults (page=1, limit=10)', async () => {
    const users = [makeUser('u1'), makeUser('u2')];
    prisma.user.findMany.mockResolvedValue(users);
    prisma.user.count.mockResolvedValue(12);

    const result = await service.listUsers({});

    expect(result.page).toBe(1);
    expect(result.total).toBe(12);
    expect(result.totalPages).toBe(2);
    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toMatchObject({
      id: 'u1',
      email: 'u1@example.com',
      project_count: 2,
    });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 10 }),
    );
  });

  it('applies page offset correctly', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(25);

    const result = await service.listUsers({ page: 3, limit: 10 });

    expect(result.page).toBe(3);
    expect(result.totalPages).toBe(3);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
  });

  it('applies sortBy and sortDir when provided', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);

    await service.listUsers({ sortBy: 'name', sortDir: 'desc' });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { name: 'desc' } }),
    );
  });

  it('falls back to created_at desc when no sortBy given', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);

    await service.listUsers({});

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { created_at: 'desc' } }),
    );
  });

  it('returns totalPages 0 when total is 0', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);

    const result = await service.listUsers({});

    expect(result.totalPages).toBe(0);
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
cd yehub-be && pnpm test --testPathPattern="admin.service.spec"
```

Expected: failures on `listUsers` tests (method signature mismatch / missing implementation).

- [ ] **Step 4: Update `AdminService.listUsers` in `admin.service.ts`**

Add the import at the top of the file (after existing imports):

```typescript
import { ListUsersQueryDto } from './dto/list-users-query.dto';
```

Replace the existing `listUsers()` method:

```typescript
async listUsers(query: ListUsersQueryDto = {}) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 10;
  const skip = (page - 1) * limit;

  const orderBy = query.sortBy
    ? { [query.sortBy]: query.sortDir ?? 'asc' }
    : { created_at: 'desc' as const };

  const select = {
    id: true,
    email: true,
    name: true,
    role: true,
    active: true,
    last_login_at: true,
    created_at: true,
    _count: { select: { memberships: true } },
  };

  const [users, total] = await this.prisma.$transaction([
    this.prisma.user.findMany({ select, orderBy, skip, take: limit }),
    this.prisma.user.count(),
  ]);

  return {
    data: users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      active: u.active,
      last_login_at: u.last_login_at,
      created_at: u.created_at,
      project_count: u._count.memberships,
    })),
    total,
    page,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd yehub-be && pnpm test --testPathPattern="admin.service.spec"
```

Expected: all tests pass including the new `listUsers` suite.

- [ ] **Step 6: Commit**

```bash
git add yehub-be/src/admin/admin.service.ts yehub-be/src/admin/admin.service.spec.ts
git commit -m "feat(admin): server-side pagination and sorting in listUsers"
```

---

### Task 3: Update `AdminController` to accept query params

**Files:**
- Modify: `yehub-be/src/admin/admin.controller.ts`

- [ ] **Step 1: Add `Query` to NestJS imports and import the DTO**

In `admin.controller.ts`, add `Query` to the existing NestJS import line:

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
```

Add the DTO import after the existing admin imports:

```typescript
import { ListUsersQueryDto } from './dto/list-users-query.dto';
```

- [ ] **Step 2: Update the `listUsers` handler**

Replace the existing `listUsers` method:

```typescript
@Get()
@ApiOperation({ summary: 'List all users' })
listUsers(@Query() query: ListUsersQueryDto) {
  return this.adminService.listUsers(query);
}
```

- [ ] **Step 3: Run full backend test suite**

```bash
cd yehub-be && pnpm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add yehub-be/src/admin/admin.controller.ts
git commit -m "feat(admin): wire ListUsersQueryDto to listUsers controller"
```

---

### Task 4: Update frontend API layer

**Files:**
- Modify: `yehub-fe/src/api/admin.ts`

- [ ] **Step 1: Add `PaginatedUsers` interface and update `listUsers`**

In `yehub-fe/src/api/admin.ts`, add the new interface after `AdminUserDetail` and update `listUsers`:

```typescript
export interface PaginatedUsers {
  data: AdminUser[]
  total: number
  page: number
  totalPages: number
}

export const adminApi = {
  listUsers: (params?: {
    sortBy?: 'name' | 'role' | 'last_login_at'
    sortDir?: 'asc' | 'desc'
    page?: number
    limit?: number
  }) =>
    apiClient
      .get<PaginatedUsers>('/admin/users', { params })
      .then((r) => r.data),

  // ... rest unchanged
```

- [ ] **Step 2: Commit**

```bash
git add yehub-fe/src/api/admin.ts
git commit -m "feat(admin): update listUsers API type to paginated response"
```

---

### Task 5: Update `AdminPanelPage` to use server-side pagination

**Files:**
- Modify: `yehub-fe/src/pages/admin/admin-panel.tsx`

- [ ] **Step 1: Update the `useQuery` call**

In `AdminPanelPage`, replace the existing `useQuery` block (lines 655–661):

```tsx
const { data, isLoading, isError } = useQuery({
  queryKey: ['admin-users', sortKey, sortDir, page],
  queryFn: () =>
    adminApi.listUsers({
      ...(sortKey ? { sortBy: sortKey, sortDir } : {}),
      page,
      limit: PAGE_SIZE,
    }),
})
```

- [ ] **Step 2: Replace client-side pagination with API response**

Remove these two lines (currently after the `useQuery` block):

```tsx
const totalPages = Math.ceil(users.length / PAGE_SIZE)
const paginatedUsers = users.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
```

Add these two lines in their place:

```tsx
const totalPages = data?.totalPages ?? 1
const paginatedUsers = data?.data ?? []
```

- [ ] **Step 3: Verify the TypeScript build**

```bash
cd yehub-fe && pnpm build 2>&1 | tail -20
```

Expected: no TypeScript errors. If there are type errors, they will be in the `useQuery` data type — ensure `data` is typed as `PaginatedUsers | undefined` (TanStack Query infers this automatically from the `queryFn` return type).

- [ ] **Step 4: Commit**

```bash
git add yehub-fe/src/pages/admin/admin-panel.tsx
git commit -m "feat(admin): use server-side pagination in AdminPanelPage"
```
