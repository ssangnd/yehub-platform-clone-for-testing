import { test, expect, type Page } from '@playwright/test';
import { SMTP4DEV_URL, TEST_USER } from '../constants';

async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/', { timeout: 10_000 });
}

async function readAuthState(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('yehub-auth');
    return raw ? JSON.parse(raw)?.state ?? null : null;
  });
}

async function getInvitationLink(email: string): Promise<string> {
  const res = await fetch(`${SMTP4DEV_URL}/api/messages`);
  const data = (await res.json()) as { results: Array<{ id: string; to: string[] }> };
  const message = data.results.find((m) => m.to.includes(email));
  expect(message, `invitation email for ${email} not found in smtp4dev`).toBeTruthy();

  const htmlRes = await fetch(`${SMTP4DEV_URL}/api/messages/${message!.id}/html`);
  const html = await htmlRes.text();
  const match = html.match(/href="(http[^"]*\/invitation\/[^"]+)"/);
  expect(match, 'invitation link not found in email body').toBeTruthy();
  return match![1];
}

test.describe('Login authentication', () => {
  test('TC_009: login with valid credentials redirects to dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('textbox', { name: 'Email' }).fill(TEST_USER.email);
    await page.getByRole('textbox', { name: 'Password' }).fill(TEST_USER.password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL((url) => url.pathname === '/', { timeout: 10_000 });
    await expect(page.getByText('Welcome to the Platform')).toBeVisible();

    const state = await readAuthState(page);
    expect(state?.accessToken).toBeTruthy();
    expect(state?.refreshToken).toBeTruthy();
  });

  test('TC_010: admin invites a new user, who can then log in', async ({ browser }) => {
    const invitedEmail = `tc010.${Date.now()}@example.com`;
    const invitedPassword = 'InvitedPass123!';

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();

    try {
      await loginAs(adminPage, TEST_USER.email, TEST_USER.password);
      await adminPage.goto('/users');
      await adminPage.getByRole('button', { name: 'Invite User' }).click();

      await adminPage.getByRole('textbox', { name: 'Full Name' }).fill('TC010 New User');
      await adminPage.getByRole('textbox', { name: 'Email' }).fill(invitedEmail);
      await adminPage.getByRole('button', { name: 'Send Invitation' }).click();

      await expect
        .poll(
          async () => {
            const res = await fetch(`${SMTP4DEV_URL}/api/messages`);
            const data = (await res.json()) as { results: Array<{ to: string[] }> };
            return data.results.some((m) => m.to.includes(invitedEmail));
          },
          { timeout: 10_000, message: 'invitation email never arrived' },
        )
        .toBe(true);

      const invitationLink = await getInvitationLink(invitedEmail);

      const invitedContext = await browser.newContext();
      const invitedPage = await invitedContext.newPage();

      try {
        await invitedPage.goto(invitationLink);
        await invitedPage
          .getByRole('textbox', { name: 'Password', exact: true })
          .fill(invitedPassword);
        await invitedPage.getByRole('textbox', { name: 'Confirm Password' }).fill(invitedPassword);
        await invitedPage.getByRole('button', { name: 'Activate Account' }).click();

        await expect(invitedPage).toHaveURL(/\/login/, { timeout: 10_000 });

        await invitedPage.getByRole('textbox', { name: 'Email' }).fill(invitedEmail);
        await invitedPage.getByRole('textbox', { name: 'Password' }).fill(invitedPassword);
        await invitedPage.getByRole('button', { name: 'Sign in' }).click();

        await expect(invitedPage).toHaveURL((url) => url.pathname === '/', { timeout: 10_000 });

        await expect
          .poll(async () => (await readAuthState(invitedPage))?.user?.email, {
            timeout: 10_000,
            message: 'auth store never hydrated with invited user email',
          })
          .toBe(invitedEmail);
      } finally {
        await invitedContext.close();
      }
    } finally {
      await adminContext.close();
    }
  });

  test('TC_011: logout clears tokens and blocks access to protected routes', async ({ page }) => {
    await loginAs(page, TEST_USER.email, TEST_USER.password);
    await page.goto('/projects');

    await page.getByRole('button', { name: /admin@sociallistening\.com/i }).click();
    await page.getByRole('menuitem', { name: 'Log out' }).click();
    await page
      .getByRole('dialog', { name: 'Log out?' })
      .getByRole('button', { name: 'Log out' })
      .click();

    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

    const state = await readAuthState(page);
    expect(state?.accessToken).toBeFalsy();
    expect(state?.refreshToken).toBeFalsy();
    expect(state?.user).toBeFalsy();

    await page.goto('/projects');
    await expect(page).toHaveURL(/\/login/);
  });

  test('TC_078: login accepts email in a different case', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('textbox', { name: 'Email' }).fill(TEST_USER.email.toUpperCase());
    await page.getByRole('textbox', { name: 'Password' }).fill(TEST_USER.password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL((url) => url.pathname === '/', { timeout: 10_000 });
  });

  test('TC_079: whitespace-only password is rejected', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('textbox', { name: 'Email' }).fill(TEST_USER.email);
    await page.getByRole('textbox', { name: 'Password' }).fill('        ');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/login/);

    const state = await readAuthState(page);
    expect(state?.accessToken).toBeFalsy();
  });
});
