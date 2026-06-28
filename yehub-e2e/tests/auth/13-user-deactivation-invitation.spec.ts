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
  payload: { name: string; email: string },
): Promise<SeededUser> {
  const res = await api.post(`${API_URL}/admin/users/invite`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { role: 'AUTHORIZED_USER', ...payload },
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

test.describe('User deactivation & invitation flow', () => {
  test.describe.configure({ mode: 'serial' });

  const runid = String(Date.now());
  const target = {
    name: `Deact-${runid}`,
    email: `deact.${runid}@example.com`,
    password: 'KnownPass123!',
  };
  const invitee = {
    name: `Invitee-${runid}`,
    email: `invitee.${runid}@example.com`,
    password: 'InviteePass123!',
  };

  let api: APIRequestContext;
  let adminToken: string;
  let targetUser: SeededUser;
  let inviteeId: string | null = null;

  test.beforeAll(async () => {
    api = await apiRequest.newContext();
    adminToken = await loginAsAdminApi(api);
    await Promise.all([purgeMessagesFor(target.email), purgeMessagesFor(invitee.email)]);
    targetUser = await inviteUserApi(api, adminToken, {
      name: target.name,
      email: target.email,
    });
    await activateViaApi(api, target.email, target.password);
    await purgeMessagesFor(target.email);
  });

  test.afterAll(async () => {
    if (targetUser?.id) await deleteUserQuietly(api, adminToken, targetUser.id);
    if (inviteeId) await deleteUserQuietly(api, adminToken, inviteeId);
    await api.dispose();
  });

  test('TC_058: admin disables a user via User Details dialog', async ({ page }) => {
    await loginAs(page, TEST_USER.email, TEST_USER.password);
    await openUserDetailsDialog(page, target.email);

    const detailsDialog = page.getByRole('dialog', { name: 'User Details' });
    await detailsDialog.getByRole('button', { name: 'Disable Account' }).click();

    const confirmDialog = page.getByRole('dialog', { name: 'Disable Account' });
    await expect(confirmDialog).toBeVisible();
    await expect(confirmDialog).toContainText(target.name);

    const [patchRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes(`/admin/users/${targetUser.id}/disable`) &&
          res.request().method() === 'PATCH',
      ),
      confirmDialog.getByRole('button', { name: 'Disable', exact: true }).click(),
    ]);
    expect(patchRes.status()).toBe(204);

    await expect(confirmDialog).toBeHidden();

    const verifyRes = await api.get(`${API_URL}/admin/users/${targetUser.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(verifyRes.status()).toBe(200);
    const verifyBody = (await verifyRes.json()) as { status: string };
    expect(verifyBody.status).toBe('INACTIVE');

    if (await detailsDialog.isVisible()) {
      await page.keyboard.press('Escape');
      await expect(detailsDialog).toBeHidden();
    }
    await expect(
      page.getByRole('row').filter({ hasText: target.email }),
    ).toContainText(/Inactive/);
  });

  test('TC_061: admin re-enables the user and login works again', async ({ page, browser }) => {
    await loginAs(page, TEST_USER.email, TEST_USER.password);
    await openUserDetailsDialog(page, target.email);

    const detailsDialog = page.getByRole('dialog', { name: 'User Details' });
    await detailsDialog.getByRole('button', { name: 'Enable Account' }).click();

    const confirmDialog = page.getByRole('dialog', { name: 'Enable Account' });
    await expect(confirmDialog).toBeVisible();
    await expect(confirmDialog).toContainText(target.name);

    const [patchRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes(`/admin/users/${targetUser.id}/enable`) &&
          res.request().method() === 'PATCH',
      ),
      confirmDialog.getByRole('button', { name: 'Enable', exact: true }).click(),
    ]);
    expect(patchRes.status()).toBe(204);

    await expect(confirmDialog).toBeHidden();

    const verifyRes = await api.get(`${API_URL}/admin/users/${targetUser.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(verifyRes.status()).toBe(200);
    const verifyBody = (await verifyRes.json()) as { status: string };
    expect(verifyBody.status).toBe('ACTIVE');

    if (await detailsDialog.isVisible()) {
      await page.keyboard.press('Escape');
      await expect(detailsDialog).toBeHidden();
    }
    await expect(
      page.getByRole('row').filter({ hasText: target.email }),
    ).toContainText(/Active/);

    const loginContext = await browser.newContext();
    const loginPage = await loginContext.newPage();
    try {
      await loginAs(loginPage, target.email, target.password);
    } finally {
      await loginContext.close();
    }
  });

  test('TC_077: invitation flow end-to-end — invite, activate, first login', async ({
    page,
    browser,
  }) => {
    await purgeMessagesFor(invitee.email);

    await loginAs(page, TEST_USER.email, TEST_USER.password);
    await page.goto('/users');
    await page.getByRole('button', { name: 'Invite User' }).click();

    const inviteDialog = page.getByRole('dialog', { name: 'Invite User' });
    await expect(inviteDialog).toBeVisible();
    await inviteDialog.getByRole('textbox', { name: 'Full Name' }).fill(invitee.name);
    await inviteDialog.getByRole('textbox', { name: 'Email' }).fill(invitee.email);

    const [inviteRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().endsWith('/admin/users/invite') && res.request().method() === 'POST',
      ),
      inviteDialog.getByRole('button', { name: 'Send Invitation' }).click(),
    ]);
    expect(inviteRes.status()).toBe(201);
    const inviteBody = (await inviteRes.json()) as SeededUser;
    inviteeId = inviteBody.id;

    const invitationToken = await getInvitationToken(invitee.email);

    const inviteeContext = await browser.newContext();
    const inviteePage = await inviteeContext.newPage();
    try {
      await inviteePage.goto(`/invitation/${invitationToken}`);
      await inviteePage
        .getByRole('textbox', { name: 'Password', exact: true })
        .fill(invitee.password);
      await inviteePage
        .getByRole('textbox', { name: 'Confirm Password' })
        .fill(invitee.password);

      const [acceptRes] = await Promise.all([
        inviteePage.waitForResponse(
          (res) =>
            res.url().includes(`/auth/invitation/${invitationToken}/accept`) &&
            res.request().method() === 'POST',
        ),
        inviteePage.getByRole('button', { name: 'Activate Account' }).click(),
      ]);
      expect(acceptRes.status()).toBe(200);

      await expect(inviteePage).toHaveURL(/\/login/, { timeout: 10_000 });

      await loginAs(inviteePage, invitee.email, invitee.password);
    } finally {
      await inviteeContext.close();
    }

    const verifyRes = await api.get(`${API_URL}/admin/users/${inviteeId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(verifyRes.status()).toBe(200);
    const verifyBody = (await verifyRes.json()) as { status: string };
    expect(verifyBody.status).toBe('ACTIVE');
  });

  // Expected to fail in CI until the backend is fixed: it currently returns
  // "Account locked. Please contact an administrator." for administratively
  // disabled accounts — indistinguishable from the failed-attempts lockout
  // response. The product rule is a disabled-specific message. Runs last so
  // the failure doesn't skip other tests under serial mode. Precondition is
  // re-established via API so TC_061's enable does not leak in.
  test('TC_059: disabled user cannot log in', async ({ browser }) => {
    const disableRes = await api.patch(`${API_URL}/admin/users/${targetUser.id}/disable`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(disableRes.status()).toBe(204);

    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto('/login');
      await page.getByRole('textbox', { name: 'Email' }).fill(target.email);
      await page.getByRole('textbox', { name: 'Password' }).fill(target.password);

      const [loginRes] = await Promise.all([
        page.waitForResponse(
          (res) => res.url().endsWith('/auth/login') && res.request().method() === 'POST',
        ),
        page.getByRole('button', { name: 'Sign in' }).click(),
      ]);
      expect(loginRes.status()).not.toBe(200);

      await expect(page).toHaveURL(/\/login/);
      await expect(page.getByText(/your account is disabled/i)).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
