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
  fullName: string,
  originalPassword: string,
) {
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  try {
    await loginAs(adminPage, TEST_USER.email, TEST_USER.password);
    await adminPage.goto('/users');
    await adminPage.getByRole('button', { name: 'Invite User' }).click();
    await adminPage.getByRole('textbox', { name: 'Full Name' }).fill(fullName);
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

async function readAuthState(page: Page) {
  const raw = await page.evaluate(() => localStorage.getItem('yehub-auth'));
  if (!raw) throw new Error('yehub-auth not in localStorage');
  return JSON.parse(raw) as {
    state: { accessToken: string; refreshToken: string };
  };
}

test.describe('Access / Refresh Token Lifecycle', () => {
  test.describe.configure({ mode: 'serial' });

  const email = `tc10.${Date.now()}@example.com`;
  const fullName = 'TC10 Token Lifecycle';
  const password = 'TokenLife12!A';
  let api: APIRequestContext;

  test.beforeAll(async ({ browser }) => {
    api = await apiRequest.newContext();
    await purgeMessagesFor(email);
    await inviteAndActivateUser(browser, email, fullName, password);
    await purgeMessagesFor(email);
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test('TC_069: refresh issues a new access token and the refresh token remains valid', async () => {
    const loginRes = await api.post(`${API_URL}/auth/login`, {
      data: { email, password },
    });
    expect(loginRes.status()).toBe(200);
    const { access_token: at1, refresh_token: rt1 } = (await loginRes.json()) as {
      access_token: string;
      refresh_token: string;
    };

    // JWT `iat`/`exp` are second-resolution; wait >1s so the new access token
    // differs from the original even when the server responds instantly.
    await new Promise((r) => setTimeout(r, 1100));

    const firstRefresh = await api.post(`${API_URL}/auth/refresh-token`, {
      data: { refresh_token: rt1 },
    });
    expect(firstRefresh.status()).toBe(200);
    const firstBody = (await firstRefresh.json()) as {
      access_token: string;
      refresh_token?: string;
    };
    expect(firstBody.access_token).toBeTruthy();
    expect(firstBody.access_token).not.toBe(at1);
    expect(firstBody.refresh_token).toBeUndefined();

    const secondRefresh = await api.post(`${API_URL}/auth/refresh-token`, {
      data: { refresh_token: rt1 },
    });
    expect(secondRefresh.status()).toBe(200);
    const secondBody = (await secondRefresh.json()) as {
      access_token: string;
      refresh_token?: string;
    };
    expect(secondBody.access_token).toBeTruthy();
    expect(secondBody.refresh_token).toBeUndefined();
  });

  test('TC_072: silent refresh on 401 retries the original request transparently', async ({
    browser,
  }) => {
    const { context, page } = await loginInNewContext(browser, email, password);
    try {
      const before = await readAuthState(page);
      const originalRefresh = before.state.refreshToken;

      const corruptedAccess = await page.evaluate(() => {
        const raw = localStorage.getItem('yehub-auth')!;
        const parsed = JSON.parse(raw);
        const parts = parsed.state.accessToken.split('.');
        parts[2] = 'bogus';
        parsed.state.accessToken = parts.join('.');
        localStorage.setItem('yehub-auth', JSON.stringify(parsed));
        return parsed.state.accessToken as string;
      });

      const refreshResponse = page.waitForResponse(
        (r) =>
          r.url() === `${API_URL}/auth/refresh-token` &&
          r.request().method() === 'POST' &&
          r.status() === 200,
      );
      const retriedMe = page.waitForResponse(
        (r) =>
          r.url() === `${API_URL}/auth/me` &&
          r.request().method() === 'GET' &&
          r.status() === 200,
      );

      await page.goto('/projects');
      await refreshResponse;
      await retriedMe;

      await expect(page).toHaveURL(/\/projects/, { timeout: 10_000 });

      const after = await readAuthState(page);
      expect(after.state.accessToken).not.toBe(corruptedAccess);
      expect(after.state.refreshToken).toBe(originalRefresh);
    } finally {
      await context.close();
    }
  });
});
