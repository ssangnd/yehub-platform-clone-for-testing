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

async function logoutViaUserMenu(page: Page, email: string) {
  await page
    .getByRole('button', { name: new RegExp(email.replace(/\./g, '\\.'), 'i') })
    .click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();
  await page
    .getByRole('dialog', { name: 'Log out?' })
    .getByRole('button', { name: 'Log out' })
    .click();
}

test.describe('Multi-device & cross-context session behavior', () => {
  test.describe.configure({ mode: 'serial' });

  const email = `tc09.${Date.now()}@example.com`;
  const fullName = 'TC09 Multi Device';
  const password = 'MultiDev12!A';
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

  test.beforeEach(async () => {
    await clearAllSessions(api, email, password);
  });

  test('TC_042: multi-device login succeeds on both devices', async ({ browser }) => {
    const a = await loginInNewContext(browser, email, password);
    const b = await loginInNewContext(browser, email, password);
    try {
      await a.page.reload();
      await expect(a.page).toHaveURL((url) => url.pathname === '/');
      await expect(b.page).toHaveURL((url) => url.pathname === '/');
    } finally {
      await a.context.close();
      await b.context.close();
    }
  });

  test('TC_043: actions in one context do not affect the other', async ({ browser }) => {
    const a = await loginInNewContext(browser, email, password);
    const b = await loginInNewContext(browser, email, password);
    try {
      await a.page.goto('/projects');
      await b.page.goto('/my-account');

      await a.page.reload();
      await b.page.reload();

      await expect(a.page).toHaveURL(/\/projects/);
      await expect(b.page).toHaveURL(/\/my-account/);
    } finally {
      await a.context.close();
      await b.context.close();
    }
  });

  test('TC_044: logout from one device keeps the other authenticated', async ({ browser }) => {
    const a = await loginInNewContext(browser, email, password);
    const b = await loginInNewContext(browser, email, password);
    try {
      await b.page.goto('/my-account');

      await a.page.goto('/projects');
      await logoutViaUserMenu(a.page, email);
      await expect(a.page).toHaveURL(/\/login/, { timeout: 10_000 });

      await b.page.reload();
      await expect(b.page).toHaveURL(/\/my-account/);
    } finally {
      await a.context.close();
      await b.context.close();
    }
  });

  test('TC_047: self-logout on device B removes its row from device A', async ({ browser }) => {
    const a = await loginInNewContext(browser, email, password);
    const b = await loginInNewContext(browser, email, password);
    try {
      await a.page.goto('/my-account');
      await expect(a.page.getByRole('heading', { name: 'Other Sessions' })).toBeVisible();

      await b.page.goto('/my-account');
      await logoutViaUserMenu(b.page, email);
      await expect(b.page).toHaveURL(/\/login/, { timeout: 10_000 });

      await a.page.reload();
      await expect(
        a.page
          .getByText('Active Sessions')
          .locator('..')
          .locator('..')
          .getByText('No other active sessions.'),
      ).toBeVisible();
    } finally {
      await a.context.close();
      await b.context.close();
    }
  });

  test('TC_070: cross-tab logout in the same context syncs via storage event', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    try {
      const tab1 = await context.newPage();
      await loginAs(tab1, email, password);

      const tab2 = await context.newPage();
      await tab2.goto('/my-account');
      await expect(tab2).toHaveURL(/\/my-account/);

      await tab1.goto('/projects');
      await logoutViaUserMenu(tab1, email);
      await expect(tab1).toHaveURL(/\/login/, { timeout: 10_000 });

      await expect(tab2).toHaveURL(/\/login/, { timeout: 10_000 });

      for (const tab of [tab1, tab2]) {
        const authState = await tab.evaluate(() => localStorage.getItem('yehub-auth'));
        expect(authState, 'yehub-auth tokens should be cleared').toMatch(
          /"accessToken":null.*"refreshToken":null/s,
        );
      }
    } finally {
      await context.close();
    }
  });

  test('TC_074: disabling a user with an active session ejects them on the next request', async ({
    browser,
  }) => {
    const victim = await loginInNewContext(browser, email, password);
    const admin = await loginInNewContext(browser, TEST_USER.email, TEST_USER.password);
    try {
      await admin.page.goto('/users');
      await admin.page.getByText(email).click();

      const disableResponse = admin.page.waitForResponse(
        (r) =>
          /\/admin\/users\/[^/]+\/disable$/.test(r.url()) &&
          r.request().method() === 'PATCH' &&
          r.status() === 204,
      );
      await admin.page
        .getByRole('dialog', { name: 'User Details' })
        .getByRole('button', { name: 'Disable Account' })
        .click();
      await admin.page
        .getByRole('dialog', { name: 'Disable Account' })
        .getByRole('button', { name: 'Disable', exact: true })
        .click();
      await disableResponse;

      await victim.page.goto('/projects');
      await expect(victim.page).toHaveURL(/\/login/, { timeout: 10_000 });
    } finally {
      await victim.context.close();
      await admin.context.close();
    }
  });
});
