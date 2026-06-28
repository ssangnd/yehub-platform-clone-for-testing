import { test, expect } from '@playwright/test';

test.describe('Login UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('TC_001: login page layout renders all controls', async ({ page }) => {
    await expect(page.getByText('Sign in', { exact: true }).first()).toBeVisible();
    await expect(
      page.getByText('Enter your email and password to access your account'),
    ).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Password' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('link', { name: /forgot password/i })).toBeVisible();
  });

  test('TC_002: email and password inputs have placeholders', async ({ page }) => {
    const emailInput = page.getByRole('textbox', { name: 'Email' });
    const passwordInput = page.getByRole('textbox', { name: 'Password' });

    await expect(emailInput).toHaveAttribute('placeholder', /.+/);
    await expect(passwordInput).toHaveAttribute('placeholder', /.+/);
  });

  test('TC_003: password input masks typed characters', async ({ page }) => {
    const passwordInput = page.getByRole('textbox', { name: 'Password' });

    await expect(passwordInput).toHaveAttribute('type', 'password');

    await passwordInput.fill('TestPassword123');
    await expect(passwordInput).toHaveValue('TestPassword123');
  });

  test('TC_004: tab order goes Email -> Password -> Sign in', async ({ page }) => {
    const emailInput = page.getByRole('textbox', { name: 'Email' });
    const passwordInput = page.getByRole('textbox', { name: 'Password' });
    const signInButton = page.getByRole('button', { name: 'Sign in' });

    await emailInput.focus();
    await expect(emailInput).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(passwordInput).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(signInButton).toBeFocused();
  });
});
