# 01 — Login Page UI

**Scope:** Static UI of the login page. No authentication state changes.
**Suggested file:** `yehub-e2e/tests/auth/login-ui.spec.ts`
**Preconditions:** `page.goto('/login')` in `beforeEach`. No user login required.

---

## TC_001 — Verify login page layout

**Objective:** Assert all login controls render and are visible.
**Precondition:** Browser is on `/login`.
**Steps:**
1. Launch the application at `/login`.
2. Observe the login screen.

**Expected result:**
- Email input (`getByRole('textbox', { name: 'Email' })`) is visible.
- Password input (`getByRole('textbox', { name: 'Password' })`) is visible.
- Login button (`getByRole('button', { name: 'Sign in' })`) is visible.
- "Forgot password?" link is visible.
- No overlapping/broken elements (assert each element is `toBeVisible` and not `toBeHidden`).

---

## TC_002 — Verify placeholder text

**Objective:** Inputs show helpful placeholder copy.
**Precondition:** On `/login`.
**Steps:**
1. Inspect Email and Password inputs.

**Expected result:**
- Email input has placeholder matching `/enter your email/i` (or the designed copy).
- Password input has placeholder matching `/enter your password/i`.
- Assert via `expect(input).toHaveAttribute('placeholder', /.../)`.

---

## TC_003 — Verify password masking

**Objective:** Password input hides characters.
**Precondition:** On `/login`.
**Steps:**
1. Fill the password input with any string.

**Expected result:**
- `input[type="password"]` — assert `expect(passwordInput).toHaveAttribute('type', 'password')`.
- Visible value in DOM should not equal the typed string in plaintext.

---

## TC_004 — Verify Tab order

**Objective:** Keyboard navigation follows visual order.
**Precondition:** On `/login`.
**Steps:**
1. Focus the Email input.
2. Press `Tab`.
3. Press `Tab` again.

**Expected result:**
- After first Tab: Password input is focused (assert `expect(passwordInput).toBeFocused()`).
- After second Tab: Login button (or forgot-password link, depending on DOM order) receives focus — assert whichever matches the designed order.

---

## Implementation notes

- These tests are pure FE; they do not need a backend. If the BE is down, they should still pass.
- Use `test.describe('Login UI', () => { test.beforeEach(async ({ page }) => { await page.goto('/login'); }); ... })`.
- Do **not** mock any routes — avoid hiding UI regressions behind mocks.
