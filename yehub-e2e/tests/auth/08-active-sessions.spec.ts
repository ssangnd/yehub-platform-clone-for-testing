import {
  test,
  expect,
  request as apiRequest,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { API_URL, SMTP4DEV_URL, TEST_USER } from '../constants';

async function purgeMessagesFor(email: string) {
  const res = await fetch(`${SMTP4DEV_URL}/api/messages`);
  const data = (await res.json()) as { results: Array<{ id: string; to: string[] }> };
  await Promise.all(
    data.results
      .filter((m) => m.to.includes(email))
      .map((m) => fetch(`${SMTP4DEV_URL}/api/messages/${m.id}`, { method: 'DELETE' })),
  );
}

async function getInvitationLink(email: string): Promise<string> {
  let link = '';
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
        const match = html.match(/href="(http[^"]*\/invitation\/[^"]+)"/);
        if (!match) return false;
        link = match[1];
        return true;
      },
      { timeout: 10_000, message: `invitation email for ${email} never arrived` },
    )
    .toBe(true);
  return link;
}

async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/', { timeout: 10_000 });
}

async function inviteAndActivateUser(
  browser: Browser,
  email: string,
  originalPassword: string,
) {
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  try {
    await loginAs(adminPage, TEST_USER.email, TEST_USER.password);
    await adminPage.goto('/users');
    await adminPage.getByRole('button', { name: 'Invite User' }).click();
    await adminPage.getByRole('textbox', { name: 'Full Name' }).fill('TC08 Session User');
    await adminPage
      .getByRole('dialog')
      .getByRole('textbox', { name: 'Email' })
      .fill(email);
    await adminPage.getByRole('button', { name: 'Send Invitation' }).click();
  } finally {
    await adminContext.close();
  }

  const invitationLink = await getInvitationLink(email);

  const invitedContext = await browser.newContext();
  const invitedPage = await invitedContext.newPage();
  try {
    await invitedPage.goto(invitationLink);
    await invitedPage
      .getByRole('textbox', { name: 'Password', exact: true })
      .fill(originalPassword);
    await invitedPage
      .getByRole('textbox', { name: 'Confirm Password' })
      .fill(originalPassword);
    await invitedPage.getByRole('button', { name: 'Activate Account' }).click();
    await expect(invitedPage).toHaveURL(/\/login/, { timeout: 10_000 });
  } finally {
    await invitedContext.close();
  }
}

async function loginInNewContext(
  browser: Browser,
  email: string,
  password: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAs(page, email, password);
  return { context, page };
}

function sessionsSection(page: Page) {
  return page.getByText('Active Sessions').locator('..').locator('..');
}

async function clearAllSessions(api: APIRequestContext, email: string, password: string) {
  const loginRes = await api.post(`${API_URL}/auth/login`, {
    data: { email, password },
  });
  if (loginRes.status() !== 200) return;
  const { access_token } = (await loginRes.json()) as { access_token: string };
  await api.delete(`${API_URL}/auth/sessions`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  await api.post(`${API_URL}/auth/logout`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
}

test.describe('Active sessions management', () => {
  test.describe.configure({ mode: 'serial' });

  const email = `tc08.${Date.now()}@example.com`;
  const originalPassword = 'Session12!A';
  let currentPassword = originalPassword;
  let api: APIRequestContext;

  test.beforeAll(async ({ browser }) => {
    api = await apiRequest.newContext();
    await purgeMessagesFor(email);
    await inviteAndActivateUser(browser, email, originalPassword);
    await purgeMessagesFor(email);
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test.beforeEach(async () => {
    await clearAllSessions(api, email, currentPassword);
  });

  test('TC_037 + TC_038: sessions list shows current session with "This device" label', async ({
    browser,
  }) => {
    const { context, page } = await loginInNewContext(browser, email, currentPassword);
    try {
      await page.goto('/my-account');
      await expect(page.getByRole('heading', { name: 'Current Session' })).toBeVisible();

      const section = sessionsSection(page);
      await expect(section.getByText('This device')).toHaveCount(1);
      await expect(section.getByText(/Active (Just now|\d)/)).toHaveCount(1);
      await expect(section.getByText('No other active sessions.')).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('TC_039: revoking a specific session kicks that device', async ({ browser }) => {
    const a = await loginInNewContext(browser, email, currentPassword);
    const b = await loginInNewContext(browser, email, currentPassword);
    try {
      await a.page.goto('/my-account');
      await expect(a.page.getByRole('heading', { name: 'Other Sessions' })).toBeVisible();

      const otherRow = sessionsSection(a.page)
        .getByRole('heading', { name: 'Other Sessions' })
        .locator('..')
        .locator('..');
      await expect(otherRow.getByRole('button', { name: 'Revoke', exact: true })).toHaveCount(1);
      await otherRow.getByRole('button', { name: 'Revoke', exact: true }).click();

      await expect(sessionsSection(a.page).getByText('No other active sessions.')).toBeVisible();

      await b.page.reload();
      await expect(b.page).toHaveURL(/\/login/, { timeout: 10_000 });
    } finally {
      await a.context.close();
      await b.context.close();
    }
  });

  test('TC_040: "Revoke all others" kicks every other session', async ({ browser }) => {
    const a = await loginInNewContext(browser, email, currentPassword);
    const b = await loginInNewContext(browser, email, currentPassword);
    const c = await loginInNewContext(browser, email, currentPassword);
    try {
      await a.page.goto('/my-account');
      await expect(a.page.getByRole('button', { name: 'Revoke all others' })).toBeVisible();

      await a.page.getByRole('button', { name: 'Revoke all others' }).click();

      await expect(sessionsSection(a.page).getByText('No other active sessions.')).toBeVisible();

      await b.page.reload();
      await c.page.reload();
      await expect(b.page).toHaveURL(/\/login/, { timeout: 10_000 });
      await expect(c.page).toHaveURL(/\/login/, { timeout: 10_000 });

      await a.page.reload();
      await expect(a.page).toHaveURL(/\/my-account/);
    } finally {
      await a.context.close();
      await b.context.close();
      await c.context.close();
    }
  });

  test('TC_041: changing password invalidates other sessions', async ({ browser }) => {
    const a = await loginInNewContext(browser, email, currentPassword);
    const b = await loginInNewContext(browser, email, currentPassword);
    const c = await loginInNewContext(browser, email, currentPassword);
    try {
      const newPassword = `NewPass1!${Date.now()}`;

      await a.page.goto('/my-account');
      await a.page.getByRole('textbox', { name: 'Current password' }).fill(currentPassword);
      await a.page.getByRole('textbox', { name: 'New password', exact: true }).fill(newPassword);
      await a.page.getByRole('textbox', { name: 'Confirm new password' }).fill(newPassword);

      const passwordChangeResponse = a.page.waitForResponse(
        (r) =>
          r.url() === `${API_URL}/auth/me/password` &&
          r.request().method() === 'PATCH' &&
          r.status() === 200,
      );
      await a.page.getByRole('button', { name: 'Update password' }).click();
      await passwordChangeResponse;

      await b.page.reload();
      await c.page.reload();
      await expect(b.page).toHaveURL(/\/login/, { timeout: 10_000 });
      await expect(c.page).toHaveURL(/\/login/, { timeout: 10_000 });

      await expect(a.page).toHaveURL(/\/my-account/);
      currentPassword = newPassword;
    } finally {
      await a.context.close();
      await b.context.close();
      await c.context.close();
    }
  });

  test.fixme(
    'TC_075: another session\'s last-active timestamp updates on activity',
    async ({ browser }) => {
      const a = await loginInNewContext(browser, email, currentPassword);
      const b = await loginInNewContext(browser, email, currentPassword);
      try {
        await a.page.goto('/my-account');
        const otherRow = sessionsSection(a.page)
          .getByRole('heading', { name: 'Other Sessions' })
          .locator('..')
          .locator('..');
        const t1 = await otherRow.getByText(/Active /).first().textContent();

        await new Promise((r) => setTimeout(r, 65_000));
        await b.page.goto('/');

        await a.page.reload();
        const t2 = await otherRow.getByText(/Active /).first().textContent();

        expect(t2).not.toBe(t1);
      } finally {
        await a.context.close();
        await b.context.close();
      }
    },
  );
});
