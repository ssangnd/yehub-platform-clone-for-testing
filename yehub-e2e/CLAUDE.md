# Project Guidelines for Claude — yehub-e2e

End-to-end tests for the YeHub platform using Playwright (Chromium).

See `README.md` for setup, scripts, and Docker stack details. This file
documents **how to plan and write tests**, and the invariants they must
follow.

## Workflow: Excel → Specs → Tests

New feature work starts from a test-case spreadsheet (e.g.
`tests/auth/YeHub - Phase 1 - Login & User Management - TestCase.xlsx`).
Convert it to code in four stages.

**The markdown spec files under `tests/<feature>/specs/` are the source
of truth for the automation suite.** Tests implement what the spec
describes; reviews check the test against the spec, not against the
spreadsheet or ad-hoc memory. This means:

- When product behavior changes, update the spec first, then the test.
- When you adapt a test to match shipped behavior (see the divergence
  table below), update the spec in the same commit so the next reader
  doesn't re-discover the decision.
- When you add, remove, or rename a TC in code, the spec must reflect
  it. A test without a matching spec row — or a spec row without a test
  — is a drift bug. Fix it before merging.
- The spreadsheet is the **seed** of the spec, not its successor.
  Don't consult the xlsx to resolve a disagreement between spec and
  test; resolve it on the spec side and update the test to match.

### 1. Analyze the spreadsheet

Read every row and label each one:

- **Automate** — deterministic, valuable in CI
- **Skip** — manual-only, unstable, or out of scope (visual design, real
  email delivery, payment gateways)
- **Add** — a gap you noticed while reading (edge case, regression
  guard, security invariant) that isn't in the sheet but should be

Flag ambiguity explicitly. If a row's expected behavior conflicts with
what the product actually does, decide up front whether the test should
**adapt** (match current behavior), **fail** (lock in the bug as a known
regression), or be marked **fixme** (feature not shipped yet).

### 2. Break down into grouped spec files

Group test cases by **feature area** (e.g. login UI, forgot-password
security, active sessions). One group per markdown file under
`tests/<feature>/specs/NN-<topic>.md`, numbered so the running order is
obvious. Each spec file lists its TCs with: objective, precondition,
steps, expected result, and any notes about bugs or product decisions.

Example layout:

```
tests/auth/specs/
  01-login-ui.md
  02-login-validation.md
  03-login-authentication.md
  04-login-security-guards.md
  05-forgot-password-ui-validation.md
  06-forgot-password-reset-flow.md
  07-forgot-password-security.md
  08-active-sessions-management.md
```

### 3. Manually verify with playwright-cli

**Before writing any test code**, walk the happy path and edge cases
through `playwright-cli`. This surfaces:

- The real accessible names for locators (which often diverge from the
  spec's copy)
- Product decisions not documented in the sheet (e.g. active-session
  banner instead of redirect, user-enumeration protection on
  forgot-password, whether a confirmation dialog exists)
- Which TCs are currently broken vs shipping as designed

Record each deviation in notes, then decide per-TC: adapt / fail / fixme.
See `.claude/skills/playwright-cli/` for the tool reference.

### 4. Implement the spec file

One `.spec.ts` per markdown spec, with the **same numeric prefix**:

```
tests/auth/
  specs/08-active-sessions-management.md
  08-active-sessions.spec.ts
```

Keep the TC IDs from the sheet in the test titles (`TC_037 + TC_038:
...`) so failures trace back to the source row. If you combine multiple
TCs into one test (e.g. two assertions from the same fixture), list all
the IDs in the title.

## Test independence — the core invariant

**Every spec file must run in isolation.** Running one file alone must
pass. Running a file after another file in any order must pass. A
worker picking up one file must not be able to corrupt another file's
data.

Concretely:

- **Each spec file creates and owns its own test user.** Do not reuse
  `TEST_USER` (the seeded admin) as the subject of a mutation — password
  changes, profile edits, session revocation, and deactivation all need
  a fresh, file-scoped user.
- **Generate unique emails with `Date.now()`** so parallel workers or
  sequential reruns cannot collide:
  ```ts
  const email = `tc08.${Date.now()}@example.com`;
  ```
- **Purge smtp4dev for that email** in `beforeAll` (and before each
  email-dependent assertion) so stray messages from prior runs don't
  pollute the inbox.
- **Prefer API-level setup** (`request.newContext()` + direct POSTs) over
  UI-level setup for anything that isn't itself under test. UI setup is
  slow, flaky, and pulls unrelated regressions into the failure surface.
- `TEST_USER` is fair game **only as a tool**: logging in as admin to
  send an invitation, read the users list, etc. Never mutate its
  password or sessions — those mutations leak into other files.

### Per-file setup template

```ts
test.describe('<Feature>: <group>', () => {
  test.describe.configure({ mode: 'serial' }); // only when TCs share state

  const email = `tcNN.${Date.now()}@example.com`;
  const originalPassword = 'OriginalPass123!';
  let currentPassword = originalPassword;
  let api: APIRequestContext;

  test.beforeAll(async ({ browser }) => {
    api = await request.newContext();
    await purgeMessagesFor(email);
    await inviteAndActivateUser(browser, email, originalPassword);
    await purgeMessagesFor(email);
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  // ...tests
});
```

When a file mutates state that must be reset between tests (e.g.
creating extra sessions), use a `beforeEach` that **calls the API
directly** rather than driving the UI:

```ts
async function clearAllSessions(api: APIRequestContext, email: string, password: string) {
  const loginRes = await api.post(`${API_URL}/auth/login`, { data: { email, password } });
  if (loginRes.status() !== 200) return;
  const { access_token } = await loginRes.json();
  await api.delete(`${API_URL}/auth/sessions`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  await api.post(`${API_URL}/auth/logout`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
}
```

## Playwright best practices

Follow the official
[Playwright best practices](https://playwright.dev/docs/best-practices).
The key rules as applied here:

### Locators

- **Use `getByRole`, `getByLabel`, `getByText` over CSS or XPath.**
  Accessible locators survive DOM refactors.
- **Scope with `getByRole('dialog')`** (or another container locator)
  when the same name exists in multiple places — e.g. an "Email" textbox
  inside an invite dialog versus the page header:
  ```ts
  adminPage.getByRole('dialog').getByRole('textbox', { name: 'Email' })
  ```
- Avoid `e15`-style playwright-cli refs in committed tests. Those refs
  are for interactive exploration only — refs shift every snapshot.

### Assertions

- **Use web-first assertions** (`await expect(locator).toBeVisible()`,
  `toHaveURL`, `toHaveCount`). They auto-retry until a timeout. Never
  `if (await locator.isVisible())` for pass/fail branches.
- **Use `expect.poll` for async state that isn't a DOM locator** —
  Zustand hydration, email arrival, derived values via `page.evaluate`:
  ```ts
  await expect
    .poll(async () => (await readAuthState(page))?.user?.email, {
      timeout: 10_000,
      message: 'auth store never hydrated',
    })
    .toBe(invitedEmail);
  ```
- **Use `page.waitForResponse` for deterministic status-code checks.**
  Don't infer "the login failed" from a URL that might race; wait for
  the POST response and assert the status directly.

### Multi-context scenarios

Simulating two devices (Device A + Device B), admin + invited user, or
any cross-session flow requires **separate `browser.newContext()`
instances**. Do not reuse a single context — Playwright shares storage
state within a context, which breaks the scenario.

```ts
const a = await loginInNewContext(browser, email, password);
const b = await loginInNewContext(browser, email, password);
try {
  // ... drive a.page and b.page independently
} finally {
  await a.context.close();
  await b.context.close();
}
```

Closing a context discards client-side state, but **the backend session
row persists** until the access token expires or is explicitly revoked.
Plan cleanup accordingly (see the `clearAllSessions` helper above).

### APIRequestContext for deterministic checks

Use `request.newContext()` directly when the UI layer would add flake:
token-rejection tests, status-code assertions, weak-password rejection,
rate-limiting probes. The UI layer is better for flows where the
user-visible response (toast copy, redirect, banner) is the actual
requirement.

### Email-dependent flows

Emails go to smtp4dev (port 5555). Share these patterns — don't
re-implement per file:

```ts
async function purgeMessagesFor(email: string) { /* DELETE /api/messages/{id} */ }
async function waitForEmailLink(email, subjectRegex, hrefRegex) {
  // expect.poll until the message appears, then extract the link
}
```

Always **purge before requesting** so the poll matches exactly the new
message, not a stale one.

### Handling product/spec divergence

When the spreadsheet expected behavior doesn't match what ships, pick
one of three explicit outcomes:

| Situation | Pattern |
|-----------|---------|
| Product decided on a different UX (e.g. active-session banner vs auto-redirect) | **Adapt** the test to match current behavior; add a comment pointing to the decision |
| Spec says behavior X, code does Y, Y is a known bug | **Write the test for X and let it fail**. Leaves the regression visible in CI. Reference the bug ID in the test name if you have one. |
| Feature not yet implemented (e.g. `lastActiveAt` timestamp updates) | **`test.fixme('TC_XXX: ...', ...)`** — keeps the spec discoverable but doesn't run |

Never silently delete a spec row because the code doesn't do it yet.

### Parallel vs serial

- **Parallel (default)** for stateless read tests (e.g. login UI
  rendering, SQLi payload rejection).
- **Serial (`test.describe.configure({ mode: 'serial' })`)** when tests
  share a setup fixture or the previous test's side effect (e.g. TC_025
  captures a reset link that TC_026 uses).
- Even inside a serial describe, each **file** still owns its own user
  and cleans up after itself. Serial is an intra-file optimization, not
  an excuse for cross-file coupling.

## File naming

- Spec markdown: `tests/<feature>/specs/NN-<topic>.md`
- Test file: `tests/<feature>/NN-<topic>.spec.ts` — same numeric prefix
  so `ls` shows them in the run order implied by the spec
- Helpers local to one feature: inline in the spec file (keep each spec
  self-contained). Only lift to a shared module once three+ files need
  the same helper, and put it under `tests/_helpers/` or similar —
  never `tests/common/` (reserved for cross-feature fixtures).

## Commands

```bash
npm test                                           # full suite
npx playwright test tests/auth/08-active-sessions.spec.ts  # one file
npx playwright test tests/auth/08-active-sessions.spec.ts --reporter=list
npm run test:headed                                # visible browser
npm run test:ui                                    # Playwright UI mode
```

Run a single spec file in isolation at least once before committing —
this is the check that catches accidental dependencies on earlier
files.
