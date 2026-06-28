# 11 — User Management: List, Search, Pagination

**Scope:** Admin Panel → Users table display, search, empty state, pagination.
**Suggested file:** `yehub-e2e/tests/auth/11-user-management-list-search.spec.ts`
**Preconditions:** Admin (`TEST_USER`) seeded. `/users` is the admin user-list
route; admin-only via `<AdminRoute>`.

## Shipped UI contract (verified 2026-04-21)

| Item | Value |
|------|-------|
| Columns (in order) | **User** (combined avatar + name + email), **Role**, **Status**, **Projects**, **Last Login** |
| Search input | `getByRole('searchbox', { name: 'Search users' })` — debounced, URL-synced as `?q=...` |
| Result counter | `role="status"` element reading `Showing X–Y of Z` (uses en-dash `\u2013`, not `-`) |
| Empty state | A row reading **"No users match your filters. Clear filters"** when `Z === 0` |
| Page size | **10** (not 25) |
| Pagination widget | `button "Go to previous page"` / `N / M` indicator / `button "Go to next page"` — no numbered page buttons; buttons are `disabled` at the boundaries |
| Search scope | Substring match across name and email (case-insensitive) |

**Implication:** the spec originally assumed separate Name and Email columns
and a 25-row page size. Tests adapt to the shipped five-column, 10-per-page
widget and assert on the `Showing X–Y of Z` status as the canonical signal.

## Seeding strategy

The database typically holds dozens of users from prior test runs. Each test
must own a **file-scoped** slice so assertions don't flake on unrelated rows.

- Generate a unique `runid = Date.now()` at file scope.
- Seed via `POST /admin/users/invite` in `beforeAll` (API-level, parallel).
  The invited users appear in the list immediately (status `INVITED`), which
  is enough — these tests don't require activation.
- Embed `runid` in every seeded name and email. Use the search box to filter
  the view to exactly the seeded rows before asserting counts.
- Delete every seeded user in `afterAll` via `DELETE /admin/users/:id`.

Seed shape used by the tests:

| Role in tests | Name | Email |
|---|---|---|
| Alice (search-by-name hit) | `AliceSearch-${runid}` | `alice.${runid}@example.com` |
| Bob   (search-by-name hit) | `BobSearch-${runid}` | `bob.${runid}@example.com` |
| Other (non-hit control) | `Other-${runid}` | `other.${runid}@example.com` |
| Fillers ×10 (pagination) | `Filler-${runid}-N` | `fillerN.${runid}@example.com` |

Total seeded: **13**. Searching by `runid` yields all 13 for TC_068;
searching by `Search-${runid}` yields exactly Alice + Bob for TC_051.

---

## TC_050 — User list displays required columns and the admin row

**Objective:** The users table exposes all five shipped columns and the
logged-in admin's own row is reachable.
**Steps:**
1. Load `/users` as admin.
2. Assert each column header is visible: `User`, `Role`, `Status`,
   `Projects`, `Last Login`.
3. Type `TEST_USER.email` into the search box to bring the admin row on-page
   (they may be paginated off view by default).
4. Assert the status counter reads `Showing 1–1 of 1` and a row containing
   the admin email exists.

**Expected result:** all five column headers render; the admin appears in
the list when searched for.

---

## TC_051 — Search by name

**Objective:** Typing a partial name filters the table. Covers fixed bug
**YEH-81** ("Missing Search functionality in User Management module").
**Steps:**
1. Fill the search box with `Search-${runid}`.
2. Assert the status counter reads `Showing 1–2 of 2`.

**Expected result:** Alice and Bob rows are visible; the Other row is not.

---

## TC_052 — Search by full email

**Objective:** A full-email search yields the exact match.
**Steps:**
1. Fill the search box with `alice.${runid}@example.com`.
2. Assert the status counter reads `Showing 1–1 of 1`.

**Expected result:** Only Alice's row is visible; Bob's row is not present.

---

## TC_053 — Empty search result

**Objective:** A query matching zero users surfaces the shipped empty-state
row.
**Steps:**
1. Fill the search box with `nomatch-${runid}`.
2. Assert the status counter reads `Showing 0–0 of 0`.
3. Assert a row with text `No users match your filters` is visible.

**Expected result:** zero data rows rendered and the empty-state message
shown.

---

## TC_068 — Pagination splits the result set and boundaries are disabled

**Objective:** With more than 10 matching users, the table paginates and
disables `Previous`/`Next` at the respective boundaries.
**Precondition:** Seed 13 users sharing `runid` (see seeding strategy
above).
**Steps:**
1. Fill the search box with `runid` to isolate the seeded slice.
2. Assert the status counter reads `Showing 1–10 of 13`.
3. Assert `Previous` is disabled, `Next` is enabled.
4. Assert exactly 10 data rows containing `runid` are visible.
5. Click `Next`.
6. Assert the status counter reads `Showing 11–13 of 13`.
7. Assert `Previous` is enabled, `Next` is disabled.
8. Assert exactly 3 data rows containing `runid` are visible.

**Expected result:** boundary states flip correctly and row counts match
`ceil(13 / 10) = 2` pages.

---

## Implementation notes

- **Seed via API, not UI.** `POST /admin/users/invite` with
  `{ name, email, role: 'AUTHORIZED_USER' }` returns the created user
  record including `id`; collect IDs and `DELETE /admin/users/:id` in
  `afterAll`. Both calls are fast and parallel-safe via `Promise.all`.
- **Do not wait on debounce manually.** Web-first assertions on the
  `Showing X–Y of Z` status element auto-retry until the debounced fetch
  settles.
- **Use the en-dash literal `\u2013` in status-text assertions.** The UI
  renders an en-dash, not a hyphen; `toHaveText('Showing 1-10 of 10')` will
  fail.
- **Scope row counts to the seeded slice.**
  `getByRole('row').filter({ hasText: runid })` avoids coupling to the
  header row, polluting rows, or the empty-state row.
- Log in through the UI in `beforeEach` — `TEST_USER` is a read-only tool
  here, not the subject of mutation. No other spec file's state is touched.
