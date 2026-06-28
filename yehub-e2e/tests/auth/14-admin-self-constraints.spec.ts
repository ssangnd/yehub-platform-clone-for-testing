import {
  test,
  expect,
  request as apiRequest,
  type APIRequestContext,
  type Browser,
  type Page,
} from '@playwright/test';
import { API_URL, SMTP4DEV_URL, TEST_USER } from '../constants';

type SeededUser = { id: string; email: string; name: string };

async function loginAsAdminApi(api: APIRequestContext): Promise<string> {
  const res = await api.post(`${API_URL}/auth/login`, {
    data: { email: TEST_USER.email, password: TEST_USER.password },
  });
  expect(res.status()).toBe(200);
  const { access_token } = (await res.json()) as { access_token: string };
  return access_token;
}

async function inviteUserApi(
  api: APIRequestContext,
  token: string,
  payload: { name: string; email: string; role: 'ADMIN' | 'AUTHORIZED_USER' | 'INTERNAL_USER' },
): Promise<SeededUser> {
  const res = await api.post(`${API_URL}/admin/users/invite`, {
    headers: { Authorization: `Bearer ${token}` },
    data: payload,
  });
  expect(res.status(), `invite ${payload.email}`).toBe(201);
  return (await res.json()) as SeededUser;
}

async function deleteUserQuietly(api: APIRequestContext, token: string, id: string) {
  await api.delete(`${API_URL}/admin/users/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function purgeMessagesFor(email: string) {
  const res = await fetch(`${SMTP4DEV_URL}/api/messages`);
  const data = (await res.json()) as { results: Array<{ id: string; to: string[] }> };
  await Promise.all(
    data.results
      .filter((m) => m.to.includes(email))
      .map((m) => fetch(`${SMTP4DEV_URL}/api/messages/${m.id}`, { method: 'DELETE' })),
  );
}

async function getInvitationToken(email: string): Promise<string> {
  let token = '';
  await expect
    .poll(
      async () => {
        const res = await fetch(`${SMTP4DEV_URL}/api/messages`);
        const data = (await res.json()) as {
          results: Array<{ id: string; to: string[]; subject: string }>;
        };
        const msg = data.results.find(
          (m) => m.to.includes(email) && /invit/i.test(m.subject),
        );
        if (!msg) return false;
        const htmlRes = await fetch(`${SMTP4DEV_URL}/api/messages/${msg.id}/html`);
        const html = await htmlRes.text();
        const match = html.match(/\/invitation\/([A-Za-z0-9._-]+)/);
        if (!match) return false;
        token = match[1];
        return true;
      },
      { timeout: 10_000, message: `invitation email for ${email} never arrived` },
    )
    .toBe(true);
  return token;
}

async function activateViaApi(api: APIRequestContext, email: string, password: string) {
  const invitationToken = await getInvitationToken(email);
  const res = await api.post(`${API_URL}/auth/invitation/${invitationToken}/accept`, {
    data: { password },
  });
  expect(res.status(), `activate ${email}`).toBe(200);
}

async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/', { timeout: 10_000 });
}

async function openUserDetailsDialog(page: Page, email: string) {
  await page.goto('/users');
  await page.getByRole('searchbox', { name: 'Search users' }).fill(email);
  await expect(page.getByRole('status')).toHaveText(/Showing 1\u20131 of 1/);
  await page.getByRole('row').filter({ hasText: email }).click();
  await expect(page.getByRole('dialog', { name: 'User Details' })).toBeVisible();
}

async function readAuthToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    const raw = localStorage.getItem('yehub-auth');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { accessToken?: string } };
    return parsed.state?.accessToken ?? null;
  });
  expect(token, 'yehub-auth access token must exist in localStorage').toBeTruthy();
  return token as string;
}

test.describe('Admin self-modification constraints & role propagation', () => {
  const runid = String(Date.now());
  const adminB = {
    name: `AdminB-${runid}`,
    email: `adminb.${runid}@example.com`,
    password: 'AdminBPass123!',
  };

  let api: APIRequestContext;
  let adminToken: string;
  let adminBUser: SeededUser;

  test.beforeAll(async () => {
    api = await apiRequest.newContext();
    adminToken = await loginAsAdminApi(api);
    await purgeMessagesFor(adminB.email);
    adminBUser = await inviteUserApi(api, adminToken, {
      name: adminB.name,
      email: adminB.email,
      role: 'ADMIN',
    });
    await activateViaApi(api, adminB.email, adminB.password);
    await purgeMessagesFor(adminB.email);
  });

  test.afterAll(async () => {
    if (adminBUser?.id) await deleteUserQuietly(api, adminToken, adminBUser.id);
    await api.dispose();
  });

  test('TC_062: admin cannot change own role — role combobox is disabled', async ({ page }) => {
    await loginAs(page, TEST_USER.email, TEST_USER.password);
    await openUserDetailsDialog(page, TEST_USER.email);

    const detailsDialog = page.getByRole('dialog', { name: 'User Details' });
    await expect(detailsDialog.getByRole('combobox')).toBeDisabled();
  });

  test('TC_063: admin cannot disable own account — button is absent', async ({ page }) => {
    await loginAs(page, TEST_USER.email, TEST_USER.password);
    await openUserDetailsDialog(page, TEST_USER.email);

    const detailsDialog = page.getByRole('dialog', { name: 'User Details' });
    await expect(
      detailsDialog.getByRole('button', { name: 'Disable Account' }),
    ).toHaveCount(0);
    await expect(
      detailsDialog.getByRole('button', { name: 'Enable Account' }),
    ).toHaveCount(0);
  });

  test('TC_064: admin cannot remove own account — button is absent', async ({ page }) => {
    await loginAs(page, TEST_USER.email, TEST_USER.password);
    await openUserDetailsDialog(page, TEST_USER.email);

    const detailsDialog = page.getByRole('dialog', { name: 'User Details' });
    await expect(
      detailsDialog.getByRole('button', { name: 'Remove User' }),
    ).toHaveCount(0);
  });

  test('TC_080: role demotion by another admin propagates on next request', async ({
    browser,
  }) => {
    const bContext = await browser.newContext();
    const bPage = await bContext.newPage();
    let bToken: string;
    try {
      await loginAs(bPage, adminB.email, adminB.password);
      bToken = await readAuthToken(bPage);

      await bPage.goto('/users');
      await expect(
        bPage.getByRole('searchbox', { name: 'Search users' }),
      ).toBeVisible();

      const aContext = await browser.newContext();
      const aPage = await aContext.newPage();
      try {
        await loginAs(aPage, TEST_USER.email, TEST_USER.password);
        await openUserDetailsDialog(aPage, adminB.email);

        const detailsDialog = aPage.getByRole('dialog', { name: 'User Details' });
        await detailsDialog.getByRole('combobox').click();
        await aPage.getByRole('option', { name: 'Authorized User' }).click();

        const confirmDialog = aPage.getByRole('dialog', { name: 'Change Role' });
        await expect(confirmDialog).toBeVisible();

        const [patchRes] = await Promise.all([
          aPage.waitForResponse(
            (res) =>
              res.url().includes(`/admin/users/${adminBUser.id}/role`) &&
              res.request().method() === 'PATCH',
          ),
          confirmDialog.getByRole('button', { name: 'Confirm' }).click(),
        ]);
        expect(patchRes.status()).toBe(200);
      } finally {
        await aContext.close();
      }

      const forbiddenRes = await api.get(`${API_URL}/admin/users`, {
        headers: { Authorization: `Bearer ${bToken}` },
      });
      expect(forbiddenRes.status()).toBe(403);

      await bPage.goto('/users');
      await expect(bPage).not.toHaveURL(/\/users(?:[?#].*)?$/, { timeout: 10_000 });
    } finally {
      await bContext.close();
    }
  });
});
