import {
  test,
  expect,
  request as apiRequest,
  type APIRequestContext,
  type Browser,
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

async function getResetTokens(email: string): Promise<string[]> {
  const res = await fetch(`${SMTP4DEV_URL}/api/messages`);
  const data = (await res.json()) as {
    results: Array<{ id: string; to: string[]; subject: string; receivedDate: string }>;
  };
  const matches = data.results
    .filter((m) => m.to.includes(email) && /reset/i.test(m.subject))
    .sort((a, b) => a.receivedDate.localeCompare(b.receivedDate));

  const tokens: string[] = [];
  for (const m of matches) {
    const htmlRes = await fetch(`${SMTP4DEV_URL}/api/messages/${m.id}/html`);
    const html = await htmlRes.text();
    const match = html.match(/href="http[^"]*reset-password\?token=([^"&]+)"/);
    if (match) tokens.push(match[1]);
  }
  return tokens;
}

async function waitForResetTokens(email: string, count: number): Promise<string[]> {
  let tokens: string[] = [];
  await expect
    .poll(
      async () => {
        tokens = await getResetTokens(email);
        return tokens.length;
      },
      { timeout: 10_000, message: `expected ${count} reset tokens for ${email}` },
    )
    .toBeGreaterThanOrEqual(count);
  return tokens;
}

async function requestReset(api: APIRequestContext, email: string) {
  const res = await api.post(`${API_URL}/auth/forgot-password`, { data: { email } });
  expect(res.status(), 'forgot-password request failed').toBeLessThan(500);
}

async function attemptReset(
  api: APIRequestContext,
  token: string,
  newPassword: string,
): Promise<number> {
  const res = await api.post(`${API_URL}/auth/reset-password`, {
    data: { token, new_password: newPassword },
  });
  return res.status();
}

async function getInvitationLink(email: string): Promise<string> {
  const res = await fetch(`${SMTP4DEV_URL}/api/messages`);
  const data = (await res.json()) as {
    results: Array<{ id: string; to: string[]; subject: string }>;
  };
  const msg = data.results.find(
    (m) => m.to.includes(email) && /invit/i.test(m.subject),
  );
  expect(msg, 'invitation email never arrived').toBeTruthy();
  const htmlRes = await fetch(`${SMTP4DEV_URL}/api/messages/${msg!.id}/html`);
  const html = await htmlRes.text();
  const match = html.match(/href="(http[^"]*\/invitation\/[^"]+)"/);
  expect(match, 'invitation link not found in email body').toBeTruthy();
  return match![1];
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
    await adminPage.getByRole('textbox', { name: 'Full Name' }).fill('TC07 Security User');
    await adminPage.getByRole('textbox', { name: 'Email' }).fill(email);
    await adminPage.getByRole('button', { name: 'Send Invitation' }).click();
  } finally {
    await adminContext.close();
  }

  await expect
    .poll(
      async () => {
        const res = await fetch(`${SMTP4DEV_URL}/api/messages`);
        const data = (await res.json()) as { results: Array<{ to: string[] }> };
        return data.results.some((m) => m.to.includes(email));
      },
      { timeout: 10_000, message: 'invitation email never arrived' },
    )
    .toBe(true);

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

test.describe('Forgot password: security', () => {
  test.describe.configure({ mode: 'serial' });

  const email = `tc07.${Date.now()}@example.com`;
  const originalPassword = 'OriginalPass123!';
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

  test('TC_030: reset link is single-use', async () => {
    await purgeMessagesFor(email);
    await requestReset(api, email);
    const [token] = await waitForResetTokens(email, 1);

    const firstPassword = `TC030Pass1!${Date.now()}`;
    expect(await attemptReset(api, token, firstPassword)).toBe(200);
    currentPassword = firstPassword;

    const reusePassword = `TC030Reuse1!${Date.now()}`;
    expect(await attemptReset(api, token, reusePassword)).toBe(401);
  });

  for (const mutation of ['flip-last', 'truncate', 'append'] as const) {
    test(`TC_033: tampered token (${mutation}) is rejected`, async () => {
      await purgeMessagesFor(email);
      await requestReset(api, email);
      const [token] = await waitForResetTokens(email, 1);

      const tampered =
        mutation === 'flip-last'
          ? token.slice(0, -1) + (token.endsWith('Z') ? 'Y' : 'Z')
          : mutation === 'truncate'
            ? token.slice(0, -5)
            : `${token}garbage`;

      expect(await attemptReset(api, tampered, 'AnyPass123!')).toBe(401);
    });
  }

  test('TC_034: only the latest reset link is valid', async () => {
    await purgeMessagesFor(email);
    for (let i = 0; i < 3; i++) {
      await requestReset(api, email);
      await new Promise((r) => setTimeout(r, 1_100));
    }
    const tokens = await waitForResetTokens(email, 3);
    const [oldest, , newest] = tokens.slice(-3);

    expect(await attemptReset(api, oldest, `TC034Old1!${Date.now()}`)).toBe(401);

    const newestPassword = `TC034New1!${Date.now()}`;
    expect(await attemptReset(api, newest, newestPassword)).toBe(200);
    currentPassword = newestPassword;
  });

  for (const weak of ['123', 'abcdefg', '        ']) {
    test(`TC_035: weak password ${JSON.stringify(weak)} is rejected on reset`, async () => {
      await purgeMessagesFor(email);
      await requestReset(api, email);
      const [token] = await waitForResetTokens(email, 1);

      expect(await attemptReset(api, token, weak)).toBe(400);
    });
  }

  test('TC_032 + TC_073: reset from device B kicks device A and keeps B functional', async ({
    browser,
  }) => {
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();

    try {
      await loginAs(pageA, email, currentPassword);

      await purgeMessagesFor(email);
      await pageB.goto('/forgot-password');
      await pageB.getByRole('textbox', { name: 'Email' }).fill(email);
      await pageB.getByRole('button', { name: /send|reset/i }).click();
      const [token] = await waitForResetTokens(email, 1);

      const finalPassword = `TC032Final1!${Date.now()}`;
      await pageB.goto(`/reset-password?token=${token}`);
      await pageB.getByRole('textbox', { name: 'New password', exact: true }).fill(finalPassword);
      await pageB.getByRole('textbox', { name: 'Confirm new password' }).fill(finalPassword);
      await pageB.getByRole('button', { name: /reset password|save/i }).click();
      await expect(pageB).toHaveURL(/\/login/, { timeout: 10_000 });
      currentPassword = finalPassword;

      // TC_032: device A is kicked on next navigation
      await pageA.reload();
      await expect(pageA).toHaveURL(/\/login/, { timeout: 10_000 });

      // TC_073: device B can log in with the new password
      await loginAs(pageB, email, finalPassword);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
