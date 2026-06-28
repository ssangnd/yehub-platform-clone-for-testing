import { test, expect, type Browser, type Page } from '@playwright/test';
import { API_URL, SMTP4DEV_URL, TEST_USER } from '../constants';

async function findMessageId(email: string, subjectRegex: RegExp): Promise<string | null> {
  const res = await fetch(`${SMTP4DEV_URL}/api/messages`);
  const data = (await res.json()) as {
    results: Array<{ id: string; to: string[]; subject: string }>;
  };
  const match = data.results.find(
    (m) => m.to.includes(email) && subjectRegex.test(m.subject),
  );
  return match?.id ?? null;
}

async function extractLinkFromMessage(id: string, hrefRegex: RegExp): Promise<string> {
  const htmlRes = await fetch(`${SMTP4DEV_URL}/api/messages/${id}/html`);
  const html = await htmlRes.text();
  const match = html.match(new RegExp(`href="(${hrefRegex.source}[^"]+)"`));
  expect(match, 'expected link not found in email body').toBeTruthy();
  return match![1];
}

async function waitForEmailLink(
  email: string,
  subjectRegex: RegExp,
  hrefRegex: RegExp,
): Promise<string> {
  let id: string | null = null;
  await expect
    .poll(
      async () => {
        id = await findMessageId(email, subjectRegex);
        return id !== null;
      },
      { timeout: 10_000, message: `email matching ${subjectRegex} for ${email} never arrived` },
    )
    .toBe(true);
  return extractLinkFromMessage(id!, hrefRegex);
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
    await adminPage.getByRole('textbox', { name: 'Full Name' }).fill('TC06 Reset User');
    await adminPage.getByRole('textbox', { name: 'Email' }).fill(email);
    await adminPage.getByRole('button', { name: 'Send Invitation' }).click();
  } finally {
    await adminContext.close();
  }

  const invitationLink = await waitForEmailLink(email, /invit/i, /http[^"]*\/invitation\//);

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

test.describe('Forgot password: end-to-end reset flow', () => {
  test.describe.configure({ mode: 'serial' });

  const email = `tc06.${Date.now()}@example.com`;
  const originalPassword = 'OriginalPass123!';
  let newPassword = '';
  let resetLink = '';

  test.beforeAll(async ({ browser }) => {
    await purgeMessagesFor(email);
    await inviteAndActivateUser(browser, email, originalPassword);
    await purgeMessagesFor(email);
  });

  test('TC_025: requesting reset sends an email with a reset link', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByRole('textbox', { name: 'Email' }).fill(email);
    await page.getByRole('button', { name: /send|reset/i }).click();

    await expect(page.getByText(/check your email/i)).toBeVisible();

    resetLink = await waitForEmailLink(email, /reset/i, /http[^"]*\/reset-password/);
    expect(resetLink).toMatch(/\/reset-password\?token=/);
  });

  test('TC_026: opening the reset link lands on the "Set New Password" page', async ({ page }) => {
    expect(resetLink, 'TC_025 must have populated resetLink').not.toBe('');

    await page.goto(resetLink);

    await expect(page).toHaveURL(/\/reset-password/);
    await expect(page.getByRole('textbox', { name: /new password/i })).toHaveCount(2);
    await expect(page.getByRole('button', { name: /reset password|save/i })).toBeVisible();
  });

  test('TC_027: submitting new passwords updates the account and redirects to /login', async ({
    page,
  }) => {
    newPassword = `NewPass1!${Date.now()}`;

    await page.goto(resetLink);
    await page.getByRole('textbox', { name: 'New password', exact: true }).fill(newPassword);
    await page.getByRole('textbox', { name: 'Confirm new password' }).fill(newPassword);
    await page.getByRole('button', { name: /reset password|save/i }).click();

    await expect(page.getByText(/password reset successfully/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test('TC_028: login with the NEW password succeeds', async ({ page }) => {
    expect(newPassword, 'TC_027 must have set newPassword').not.toBe('');
    await loginAs(page, email, newPassword);
  });

  test('TC_029: login with the OLD password fails with 401', async ({ page }) => {
    const loginResponse = page.waitForResponse(
      (r) => r.url() === `${API_URL}/auth/login` && r.request().method() === 'POST',
    );

    await page.goto('/login');
    await page.getByRole('textbox', { name: 'Email' }).fill(email);
    await page.getByRole('textbox', { name: 'Password' }).fill(originalPassword);
    await page.getByRole('button', { name: 'Sign in' }).click();

    const response = await loginResponse;
    expect(response.status()).toBe(401);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/invalid email or password/i)).toBeVisible();
  });
});
