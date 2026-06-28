# List Projects Pagination — Design Spec

**Date:** 2026-03-28
**Scope:** Backend only (`yehub-be`)

## Problem

`GET /projects` returns a flat array with no filtering or pagination. The frontend (`ProjectsListPage`) expects a paginated response shape `{ data, total, page, totalPages }` and passes query params `q`, `page`, `limit`, `active`.

## Approach

Feature-scoped: add a query DTO inside `projects/dto/`, update service and controller. No shared pagination infrastructure (YAGNI — first paginated endpoint).

## Files Changed

| File | Change |
|------|--------|
| `src/projects/dto/list-projects-query.dto.ts` | New — query params DTO |
| `src/projects/projects.service.ts` | Update `findAll` signature + implementation |
| `src/projects/projects.controller.ts` | Add `@Query()` to `findAll` handler |

## DTO: `ListProjectsQueryDto`

```ts
class ListProjectsQueryDto {
  q?: string        // optional; case-insensitive search on name OR client_name
  page?: number     // default 1; min 1
  limit?: number    // default 20; min 1; max 100
  active?: boolean  // optional; omit = return all regardless of active status
}
```

Decorators: `class-validator` + `class-transformer` (already used elsewhere in the project).

## Service: `findAll(userId, query)`

```
where = {
  memberships: { some: { user_id: userId } },
  ...(active !== undefined && { active }),
  ...(q && { OR: [
    { name: { contains: q, mode: 'insensitive' } },
    { client_name: { contains: q, mode: 'insensitive' } },
  ]}),
}

[projects, total] = await prisma.$transaction([
  prisma.project.findMany({ where, include: PROJECT_INCLUDE, orderBy, skip, take }),
  prisma.project.count({ where }),
])

return {
  data: projects.map(formatProject),
  total,
  page,
  totalPages: Math.ceil(total / limit),
}
```

## Controller

Add `@Query() query: ListProjectsQueryDto` to `findAll`, pass to service. Add `@ApiQuery` decorators for Swagger documentation.

## Response Shape

```json
{
  "data": [ ...Project[] ],
  "total": 42,
  "page": 1,
  "totalPages": 3
}
```

Matches the existing frontend `ProjectsPage` type exactly.

## Error Handling

- Invalid `page`/`limit` (non-integer, out of range): `class-validator` returns 400 automatically via NestJS `ValidationPipe`.
- No results: returns `{ data: [], total: 0, page: 1, totalPages: 0 }` — not a 404.

## Testing

- Unit test `findAll` with combinations of `q`, `page`, `limit`, `active` — verify correct `where`, `skip`, `take`, and response shape.
- No schema migrations needed.
