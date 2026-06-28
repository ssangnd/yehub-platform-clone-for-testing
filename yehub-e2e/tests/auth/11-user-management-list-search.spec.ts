import {
  test,
  expect,
  request as apiRequest,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { API_URL, TEST_USER } from '../constants';

type SeededUser = { id: string; email: string; name: string };

async function loginAsAdminApi(api: APIRequestContext): Promise<string> {
  const res = await api.post(`${API_URL}/auth/login`, {
    data: { email: TEST_USER.email, password: TEST_USER.password },
  });
  expect(res.status()).toBe(200);
  const { access_token } = (await res.json()) as { access_token: string };
  return access_token;
}

async function inviteUser(
  api: APIRequestContext,
  token: string,
  payload: { name: string; email: string },
): Promise<SeededUser> {
  const res = await api.post(`${API_URL}/admin/users/invite`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { ...payload, role: 'AUTHORIZED_USER' },
  });
  expect(res.status(), `invite ${payload.email}`).toBe(201);
  return (await res.json()) as SeededUser;
}

async function deleteUser(api: APIRequestContext, token: string, id: string) {
  await api.delete(`${API_URL}/admin/users/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/', { timeout: 10_000 });
}

test.describe('User Management: list, search, pagination', () => {
  test.describe.configure({ mode: 'serial' });

  const runid = String(Date.now());
  const searchTag = `Search-${runid}`;
  const alice = { name: `Alice${searchTag}`, email: `alice.${runid}@example.com` };
  const bob = { name: `Bob${searchTag}`, email: `bob.${runid}@example.com` };
  const other = { name: `Other-${runid}`, email: `other.${runid}@example.com` };
  const fillers = Array.from({ length: 10 }, (_, i) => ({
    name: `Filler-${runid}-${i + 1}`,
    email: `filler${i + 1}.${runid}@example.com`,
  }));
  const TOTAL_SEEDED = 3 + fillers.length;

  let api: APIRequestContext;
  let adminToken: string;
  const seeded: SeededUser[] = [];

  test.beforeAll(async () => {
    api = await apiRequest.newContext();
    adminToken = await loginAsAdminApi(api);
    const payloads = [alice, bob, other, ...fillers];
    const created = await Promise.all(payloads.map((p) => inviteUser(api, adminToken, p)));
    seeded.push(...created);
  });

  test.afterAll(async () => {
    await Promise.all(seeded.map((u) => deleteUser(api, adminToken, u.id)));
    await api.dispose();
  });

  test.beforeEach(async ({ page }) => {
    await loginAs(page, TEST_USER.email, TEST_USER.password);
    await page.goto('/users');
  });

  test('TC_050: user list shows required columns and the admin row', async ({ page }) => {
    const table = page.getByRole('table');
    for (const name of ['User', 'Role', 'Status', 'Projects', 'Last Login']) {
      await expect(table.getByRole('columnheader', { name })).toBeVisible();
    }
    await page.getByRole('searchbox', { name: 'Search users' }).fill(TEST_USER.email);
    await expect(page.getByRole('status')).toHaveText('Showing 1\u20131 of 1');
    await expect(page.getByRole('row').filter({ hasText: TEST_USER.email })).toHaveCount(1);
  });

  test('TC_051: search by name filters to matching users', async ({ page }) => {
    await page.getByRole('searchbox', { name: 'Search users' }).fill(searchTag);
    await expect(page.getByRole('status')).toHaveText('Showing 1\u20132 of 2');
    await expect(page.getByRole('row').filter({ hasText: alice.email })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: bob.email })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: other.email })).toHaveCount(0);
  });

  test('TC_052: search by full email returns exactly one row', async ({ page }) => {
    await page.getByRole('searchbox', { name: 'Search users' }).fill(alice.email);
    await expect(page.getByRole('status')).toHaveText('Showing 1\u20131 of 1');
    await expect(page.getByRole('row').filter({ hasText: alice.email })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: bob.email })).toHaveCount(0);
  });

  test('TC_053: empty search result shows the empty-state message', async ({ page }) => {
    await page.getByRole('searchbox', { name: 'Search users' }).fill(`nomatch-${runid}`);
    await expect(page.getByRole('status')).toHaveText('Showing 0\u20130 of 0');
    await expect(page.getByText(/No users match your filters/i)).toBeVisible();
  });

  test('TC_068: pagination splits the result set and boundary buttons are disabled', async ({
    page,
  }) => {
    await page.getByRole('searchbox', { name: 'Search users' }).fill(runid);
    await expect(page.getByRole('status')).toHaveText(`Showing 1\u201310 of ${TOTAL_SEEDED}`);

    const prev = page.getByRole('button', { name: 'Go to previous page' });
    const next = page.getByRole('button', { name: 'Go to next page' });
    await expect(prev).toBeDisabled();
    await expect(next).toBeEnabled();

    const seededRowsInView = page.getByRole('row').filter({ hasText: runid });
    await expect(seededRowsInView).toHaveCount(10);

    await next.click();
    await expect(page.getByRole('status')).toHaveText(
      `Showing 11\u2013${TOTAL_SEEDED} of ${TOTAL_SEEDED}`,
    );
    await expect(seededRowsInView).toHaveCount(TOTAL_SEEDED - 10);
    await expect(prev).toBeEnabled();
    await expect(next).toBeDisabled();
  });
});
