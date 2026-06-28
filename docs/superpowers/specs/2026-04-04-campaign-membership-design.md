# Campaign Membership Design

## Summary

Add campaign-specific membership so that users who are **not** project members can be granted access to individual campaigns. Project members automatically inherit access to all campaigns within their project (inherited members). Campaign membership is exclusively for external users.

## Key Decisions

- **Shared role enum:** Rename `ProjectRole` → `MemberRole` (values: MANAGER, EXECUTIVE, ANALYST, VIEWER). Used by both `ProjectMembership` and `CampaignMembership`.
- **Separate table:** New `CampaignMembership` model (Approach A), not a polymorphic unified table.
- **No overlap:** A user who is already a project member cannot be added as a campaign member (enforced in code, 409 Conflict).
- **Admin bypass:** `GlobalRole.ADMIN` has full access to all campaigns, same as projects.
- **Member management:** Only `MANAGER` role can add/remove/update campaign members (same as project).

## Schema Changes

### Rename Enum

```prisma
enum MemberRole {
  MANAGER
  EXECUTIVE
  ANALYST
  VIEWER

  @@map("member_role")
}
```

Update `ProjectMembership.role` to use `MemberRole`.

### New Model

```prisma
model CampaignMembership {
  user_id     String     @db.Uuid
  campaign_id String     @db.Uuid
  role        MemberRole
  added_by    String     @db.Uuid
  created_at  DateTime   @default(now())

  user     User     @relation("CampaignMember", fields: [user_id], references: [id], onDelete: Cascade)
  addedByUser User  @relation("CampaignMemberAddedBy", fields: [added_by], references: [id], onDelete: Cascade)
  campaign Campaign @relation(fields: [campaign_id], references: [id], onDelete: Cascade)

  @@id([user_id, campaign_id])
  @@index([campaign_id])
  @@map("campaign_memberships")
}
```

### Relation Updates

- `User`: add `campaignMemberships CampaignMembership[]`
- `Campaign`: add `campaignMemberships CampaignMembership[]`

## API Endpoints

All under `JwtAuthGuard` + `CampaignRolesGuard`.

| Method   | Route                              | Access       | Description                              |
|----------|------------------------------------|--------------|------------------------------------------|
| `GET`    | `/campaigns/:id/members`           | Any member   | List all members (inherited + direct)    |
| `GET`    | `/campaigns/:id/non-members`       | MANAGER      | List users available to add              |
| `POST`   | `/campaigns/:id/members`           | MANAGER      | Add a campaign member                    |
| `PATCH`  | `/campaigns/:id/members/:userId`   | MANAGER      | Update member role                       |
| `DELETE` | `/campaigns/:id/members/:userId`   | MANAGER      | Remove campaign member                   |

### Response: `GET /campaigns/:id/members`

```json
{
  "inherited": [
    { "user": { "id": "...", "name": "...", "email": "...", "avatar": "..." }, "role": "MANAGER", "source": "project" }
  ],
  "direct": [
    { "user": { "id": "...", "name": "...", "email": "...", "avatar": "..." }, "role": "VIEWER", "source": "campaign", "addedBy": "...", "createdAt": "..." }
  ]
}
```

### Validation Rules

- `POST /campaigns/:id/members`: Reject with **409 Conflict** if user is already a project member.
- `POST /campaigns/:id/members`: Reject with **409 Conflict** if user is already a campaign member.
- `DELETE /campaigns/:id/members/:userId`: Only removes direct campaign members, not inherited.

## Guard Changes

### `CampaignRolesGuard` Update

Updated resolution order:

1. `GlobalRole.ADMIN` → allow with full access
2. Check `ProjectMembership` for the campaign's project → use project role if found
3. Check `CampaignMembership` for the campaign → use campaign role if found
4. Neither → deny

### `GET /campaigns` (List All)

Update `CampaignsService.findAll` to also include campaigns where the user has a `CampaignMembership`, not just project-based access.

## Rename: `ProjectRole` → `MemberRole`

Cross-cutting changes:

- **Prisma schema:** Rename enum `ProjectRole` → `MemberRole`, update both membership models
- **No migration:** Only update `schema.prisma` and run `pnpm prisma:generate` to regenerate the client
- **Decorator:** `ROLES_KEY` from `'projectRoles'` → `'roles'`; export single `Roles` decorator
- **All backend imports:** Update `ProjectRole` → `MemberRole` across controllers, guards, services, DTOs
- **Guard files:** `ProjectRolesGuard` and `CampaignRolesGuard` use `MemberRole`
