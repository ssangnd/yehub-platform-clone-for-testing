import { test, expect, type Page } from '@playwright/test';
import { API_URL, TEST_USER } from '../constants';

async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/', { timeout: 10_000 });
}

async function logoutViaUserMenu(page: Page) {
  await page
    .getByRole('button', { name: new RegExp(TEST_USER.email.replace(/\./g, '\\.'), 'i') })
    .click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();
  await page
    .getByRole('dialog', { name: 'Log out?' })
    .getByRole('button', { name: 'Log out' })
    .click();
  await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
}

test.describe('Login security: route guards', () => {
  for (const path of ['/', '/users', '/projects', '/settings']) {
    test(`TC_014: unauthenticated access to ${path} redirects to /login`, async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      try {
        await page.goto(path);
        await expect(page).toHaveURL(/\/login/);
        await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
      } finally {
        await context.close();
      }
    });
  }

  test('TC_015: back button after logout does not restore protected page', async ({ page }) => {
    await loginAs(page, TEST_USER.email, TEST_USER.password);
    await page.goto('/projects');
    await expect(page).toHaveURL(/\/projects/);

    await logoutViaUserMenu(page);

    await page.goBack();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
  });

  test('TC_071: authenticated visit to /login shows Active Session banner instead of form', async ({
    page,
  }) => {
    await loginAs(page, TEST_USER.email, TEST_USER.password);

    await page.goto('/login');

    await expect(page.getByText('Active Session')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Go to Dashboard' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Logout & Continue' })).toBeVisible();

    await expect(page.getByRole('textbox', { name: 'Email' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).not.toBeVisible();
  });
});

test.describe('Login security: input handling', () => {
  const sqlInjectionPayloads = [
    "' OR 1=1 --",
    "' OR '1'='1",
    "admin' --",
    "'; DROP TABLE users; --",
  ];

  for (const payload of sqlInjectionPayloads) {
    test(`TC_016: SQL injection payload ${JSON.stringify(payload)} is rejected safely`, async ({
      page,
    }) => {
      const loginResponse = page.waitForResponse(
        (response) =>
          response.url() === `${API_URL}/auth/login` && response.request().method() === 'POST',
        { timeout: 3_000 },
      ).catch(() => null);

      await page.goto('/login');
      await page.getByRole('textbox', { name: 'Email' }).fill(payload);
      await page.getByRole('textbox', { name: 'Password' }).fill(payload);
      await page.getByRole('button', { name: 'Sign in' }).click();

      const response = await loginResponse;
      if (response) {
        expect([400, 401]).toContain(response.status());
      }

      await expect(page).toHaveURL(/\/login/);
      await expect(page.getByText(/invalid (input|email or password)/i)).toBeVisible();
    });
  }

  test('TC_017: leading/trailing spaces on email are trimmed and login succeeds', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByRole('textbox', { name: 'Email' }).fill(`  ${TEST_USER.email}  `);
    await page.getByRole('textbox', { name: 'Password' }).fill(TEST_USER.password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL((url) => url.pathname === '/', { timeout: 10_000 });
  });

});
