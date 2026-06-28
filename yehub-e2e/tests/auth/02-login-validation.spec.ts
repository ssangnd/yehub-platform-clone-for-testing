import { test, expect } from '@playwright/test';
import { API_URL, TEST_USER } from '../constants';

const INVALID_CREDENTIALS_PREFIX = /^Invalid email or password/;

test.describe('Login validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('TC_005: submitting empty form shows required-field errors', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText('Invalid input')).toBeVisible();
    await expect(page.getByText('Password is required')).toBeVisible();
  });

  for (const invalidEmail of ['not-an-email', 'test@com', '@missing-local.com', 'has space@x.com']) {
    test(`TC_006: rejects invalid email format "${invalidEmail}"`, async ({ page }) => {
      await page.getByRole('textbox', { name: 'Email' }).fill(invalidEmail);
      await page.getByRole('textbox', { name: 'Password' }).fill('somepassword');
      await page.getByRole('button', { name: 'Sign in' }).click();

      await expect(page).toHaveURL(/\/login/);
      await expect(page.getByText('Invalid input')).toBeVisible();
    });
  }

  test('TC_007: valid email + wrong password returns 401 and generic error', async ({ page }) => {
    const loginResponse = page.waitForResponse(
      (response) => response.url() === `${API_URL}/auth/login` && response.request().method() === 'POST',
    );

    await page.getByRole('textbox', { name: 'Email' }).fill(TEST_USER.email);
    await page.getByRole('textbox', { name: 'Password' }).fill('definitely-wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    const response = await loginResponse;
    expect(response.status()).toBe(401);

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(INVALID_CREDENTIALS_PREFIX)).toBeVisible();
  });

  test('TC_008: non-existent email returns 401 with generic error (shared prefix with TC_007)', async ({
    page,
  }) => {
    const loginResponse = page.waitForResponse(
      (response) => response.url() === `${API_URL}/auth/login` && response.request().method() === 'POST',
    );

    await page.getByRole('textbox', { name: 'Email' }).fill(`nonexistent+${Date.now()}@example.com`);
    await page.getByRole('textbox', { name: 'Password' }).fill('anypassword');
    await page.getByRole('button', { name: 'Sign in' }).click();

    const response = await loginResponse;
    expect(response.status()).toBe(401);

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(INVALID_CREDENTIALS_PREFIX)).toBeVisible();
  });
});
