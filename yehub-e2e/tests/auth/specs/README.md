# Auth & User Management — Automation Spec Files

Each markdown file in this directory is a self-contained brief for a single LLM session that implements the listed Playwright tests.

## Shared conventions (apply to every file)

- **Framework:** Playwright w/ `@playwright/test`. Config at `yehub-e2e/playwright.config.ts`.
- **Constants:** import from `yehub-e2e/tests/constants.ts` (`TEST_USER`, `API_URL`, `SMTP4DEV_URL`).
- **Base URL:** resolved by Playwright config; navigate with relative paths (`page.goto('/login')`).
- **Selectors:** prefer role-based queries (`page.getByRole('textbox', { name: 'Email' })`) — this matches the style in existing `login.spec.ts` and `invite-user.spec.ts`.
- **API mocking:** use `page.route(...)` only when asserting error paths the BE can't easily produce (e.g., wrong-password error without actually seeding a bad credential). Prefer hitting the real BE.
- **Email assertions:** query `smtp4dev` at `${SMTP4DEV_URL}/api/messages` then fetch `/api/messages/{id}/html`. Pattern already used in `invite-user.spec.ts` (see `getInvitationLink` helper).
- **Serial vs parallel:** add `test.describe.configure({ mode: 'serial' })` when a later test depends on state left by an earlier one (e.g., reset flow, deactivation flow).
- **Cleanup:** in `afterAll`/`afterEach`, delete any users, sessions, or projects created during the test so reruns are idempotent.

## File index

| File | Scope | # Tests |
|------|-------|---------|
| `01-login-ui.md` | Login page static UI | 4 |
| `02-login-validation.md` | Login form validation | 4 |
| `03-login-authentication.md` | Login happy path + logout | 5 |
| `04-login-security-guards.md` | URL access guards, SQLi, rate limit | 6 |
| `05-forgot-password-ui-validation.md` | Forgot password form | 6 |
| `06-forgot-password-reset-flow.md` | End-to-end reset via smtp4dev | 5 |
| `07-forgot-password-security.md` | Link reuse, tamper, session kicks | 6 |
| `08-active-sessions-management.md` | Sessions list + remote logout | 6 |
| `09-multi-device-sessions.md` | Multi-context session behavior | 6 |
| `10-token-lifecycle.md` | Refresh token rotation + silent refresh | 2 |
| `11-user-management-list-search.md` | User list, search, pagination | 5 |
| `12-user-management-profile-updates.md` | Update profile + permissions | 5 |
| `13-user-deactivation-invitation.md` | Disable/enable + invitation flow | 4 |
| `14-admin-self-constraints.md` | Admin cannot modify self | 5 |

Total: 69 tests (57 from the Phase 1 test plan marked "Automate" + 12 recommended additions TC_069–TC_080).
